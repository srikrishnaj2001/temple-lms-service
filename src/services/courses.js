'use strict';

const {
  Course,
  Module,
  Enrollment,
  Content,
  Video,
  Resource,
  Audio,
  Read,
  User,
  UserRole,
  EnrollmentContentProgress,
  ContentAttachment,
  CourseRole,
  Role,
  Category,
  sequelize
} = require('../../models');
const { Op } = require('sequelize');
const summaryService = require('./summaryService');
const { getGumletAsset, getGumletAudioAsset } = require('../utils/gumlet-assets');

function mapProgressStatus(dbStatus) {
  switch (dbStatus) {
    case 'COMPLETED': return 'COMPLETE';
    case 'IN_PROGRESS': return 'IN_PROGRESS';
    default: return 'YET_TO_BEGIN';
  }
}

function mapCourseSummary(course) {
  const modules = course.modules || [];
  const sectionCount = modules.reduce(
    (sum, module) => sum + ((module.contents || []).length),
    0
  );

  return {
    courseId: course.id,
    id: course.id,
    title: course.title,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl || null,
    moduleCount: modules.length,
    sectionCount,
    roleNames: Array.isArray(course.roles) ? course.roles.map((role) => role.name) : [],
    categories: Array.isArray(course.categories)
      ? course.categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        sequenceNumber: category.sequenceNumber || 0
      }))
      : [],
    lastAccessedAt: course.lastAccessedAt || null
  };
}

async function resolveUser(userEmail) {
  const user = await User.findOne({
    where: { email: User.normalizeEmail(userEmail) }
  });
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

async function attachContentData(contents, progressMap = {}) {
  for (const content of contents) {
    content.dataValues.progress = mapProgressStatus(progressMap[content.id]);
    if (['AUDIO', 'READ'].includes(content.contentType)) {
      const asset = await (content.contentType === 'AUDIO' ? Audio : Read).findByPk(content.contentId);
      if (asset) {
        const { id, createdAt, updatedAt, ...fields } = asset.toJSON();
        Object.assign(content.dataValues, fields);
      }
    }

    if (content.contentType === 'VIDEO') {
      const video = await Video.findByPk(content.contentId, {
        attributes: ['id', 'title', 'description', 'summary', 'durationMs', 'externalVideoId']
      });
      if (video) {
        content.dataValues.title = video.title;
        content.dataValues.description = video.description;
        content.dataValues.summary = video.summary;
        content.dataValues.externalVideoId = video.externalVideoId;
        content.dataValues.durationMs = video.durationMs;
      }
    }

    if (content.contentType === 'RESOURCE') {
      const resource = await Resource.findByPk(content.contentId, {
        attributes: ['id', 'title', 'description', 'url', 'type']
      });
      if (resource) {
        content.dataValues.title = resource.title;
        content.dataValues.description = resource.description;
        content.dataValues.url = resource.url;
        content.dataValues.type = resource.type;
      }
    }
  }
}

class CourseService {
  async getEnrolledCourses(userEmail, tenantId = null) {
    const user = await resolveUser(userEmail);

    const enrolledCourses = await Enrollment.findAll({
      where: { userId: user.id },
      attributes: ['id', 'courseId', 'createdAt', 'lastAccessedAt'],
      include: [{
        model: Course,
        as: 'course',
        where: tenantId ? { tenantId } : {},
        required: true,
        attributes: ['id', 'title', 'description', 'thumbnailUrl'],
        include: [
          {
            model: Module,
            as: 'modules',
            attributes: ['id'],
            required: false,
            include: [{
              model: Content,
              as: 'contents',
              attributes: ['id'],
              required: false
            }]
          },
          {
            model: Role,
            as: 'roles',
            attributes: ['name'],
            through: { attributes: [] },
            required: false
          },
          {
            model: Category,
            as: 'categories',
            attributes: ['id', 'name', 'slug', 'description', 'sequenceNumber'],
            through: { attributes: ['sequenceNumber'] },
            required: false
          }]
      }],
      order: [['createdAt', 'DESC']]
    });

    return enrolledCourses
      .filter((enrollment) => enrollment.course)
      .map((enrollment) => ({
        ...mapCourseSummary(Object.assign(enrollment.course, {
          lastAccessedAt: enrollment.lastAccessedAt || null
        })),
        enrollmentId: enrollment.id
      }));
  }

  async getCatalogCourses(tenantId = null) {
    const courses = await Course.findAll({
      where: tenantId ? { tenantId } : {},
      attributes: ['id', 'title', 'description', 'thumbnailUrl', 'createdAt'],
      include: [
        {
          model: Module,
          as: 'modules',
          attributes: ['id'],
          required: false,
          include: [{
            model: Content,
            as: 'contents',
            attributes: ['id'],
            required: false
          }]
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['name'],
          through: { attributes: [] },
          required: false
        },
        {
          model: Category,
          as: 'categories',
          attributes: ['id', 'name', 'slug', 'description', 'sequenceNumber'],
          through: { attributes: ['sequenceNumber'] },
          required: false
        }]
      ,
      order: [['createdAt', 'DESC']]
    });

    return courses.map(mapCourseSummary);
  }

  async getDashboardCourse(userEmail, tenantId = null) {
    const user = await resolveUser(userEmail);

    const mostRecentEnrollment = await Enrollment.findOne({
      where: { userId: user.id, lastAccessedAt: { [Op.ne]: null } },
      attributes: ['id'],
      include: [{
        model: Course,
        as: 'course',
        where: tenantId ? { tenantId } : {},
        required: true,
        attributes: []
      }],
      order: [['lastAccessedAt', 'DESC'], ['updatedAt', 'DESC']]
    });

    if (!mostRecentEnrollment) return null;
    return this.getDashboardCourseByEnrollmentId(mostRecentEnrollment.id);
  }

  async getDashboardCourseByCourseId(courseId, userEmail, tenantId = null) {
    const user = await resolveUser(userEmail);

    const enrollment = await Enrollment.findOne({
      where: { courseId, userId: user.id },
      attributes: ['id'],
      include: [{
        model: Course,
        as: 'course',
        where: tenantId ? { tenantId } : {},
        required: true,
        attributes: []
      }]
    });

    if (!enrollment) return null;
    return this.getDashboardCourseByEnrollmentId(enrollment.id);
  }

  async getDashboardCourseByEnrollmentId(enrollmentId) {
    const enrolledCourse = await Enrollment.findOne({
      where: { id: enrollmentId },
      include: [{
        model: Course,
        as: 'course',
        attributes: ['id', 'title', 'description', 'thumbnailUrl', 'createdAt', 'updatedAt'],
        include: [
          {
            model: Module,
            as: 'modules',
            attributes: ['id', 'title', 'description', 'sequenceNumber', 'startDate', 'endDate'],
            required: false,
            include: [{
              model: Content,
              as: 'contents',
              attributes: ['id', 'contentType', 'contentId', 'sequenceNumber', 'startDate'],
              required: false
            }]
          },
          {
            model: Category,
            as: 'categories',
            attributes: ['id', 'name', 'slug', 'description', 'sequenceNumber'],
            through: { attributes: ['sequenceNumber'] },
            required: false
          }
        ]
      }],
      order: [
        [{ model: Course, as: 'course' }, { model: Module, as: 'modules' }, 'sequenceNumber', 'ASC'],
        [{ model: Course, as: 'course' }, { model: Module, as: 'modules' }, { model: Content, as: 'contents' }, 'sequenceNumber', 'ASC']
      ]
    });

    if (!enrolledCourse?.course) return null;

    const progressRecords = await EnrollmentContentProgress.findAll({
      where: { enrollmentId: enrolledCourse.id },
      attributes: ['contentId', 'status']
    });

    const progressMap = {};
    progressRecords.forEach((record) => {
      progressMap[record.contentId] = record.status;
    });

    for (const module of enrolledCourse.course.modules || []) {
      module.dataValues.contentCount = module.contents?.length || 0;
      await attachContentData(module.contents || [], progressMap);
    }

    enrolledCourse.dataValues.enrollmentId = enrolledCourse.id;
    enrolledCourse.course.dataValues.lastAccessedAt = enrolledCourse.lastAccessedAt || null;
    enrolledCourse.dataValues.hasPendingForms = false;
    enrolledCourse.course.dataValues.forms = [];
    return enrolledCourse;
  }

  async getCourseLibrary(courseId, userEmail, tenantId = null) {
    const { QueryTypes } = require('sequelize');
    const user = await resolveUser(userEmail);

    const enrollment = await sequelize.transaction(async transaction => {
      // Serialize first access; never restore an enrollment explicitly removed by an admin.
      await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
      const course = await Course.findOne({ where: { id: courseId, ...(tenantId ? { tenantId } : {}) }, transaction });
      if (!course) throw new Error('Course not found');
      const existing = await Enrollment.findOne({ where: { userId: user.id, courseId }, paranoid: false, transaction });
      if (existing && !existing.deletedAt) return existing;
      if (existing) throw new Error('User is not enrolled in this course');

      const onboarded = user.onboardingSkipped || (user.phone && await UserRole.count({ where: { userId: user.id }, transaction }));
      const tenantEnrollment = onboarded && await Enrollment.findOne({
        where: { userId: user.id },
        include: [{ model: Course, as: 'course', where: { tenantId: course.tenantId }, required: true }],
        transaction
      });
      if (!tenantEnrollment) throw new Error('User is not enrolled in this course');
      return Enrollment.create({ userId: user.id, courseId }, { transaction });
    });

    await Enrollment.update(
      { lastAccessedAt: new Date() },
      { where: { id: enrollment.id } }
    );

    const rows = await sequelize.query(`
      SELECT
        c.id AS "courseId",
        c.title AS "courseTitle",
        c.description AS "courseDescription",
        c."thumbnailUrl" AS "courseThumbnailUrl",
        m.id AS "moduleId",
        m.title AS "moduleTitle",
        m.description AS "moduleDescription",
        m."startDate" AS "moduleStartDate",
        m."sequenceNumber" AS "moduleSequence",
        ct.id AS "contentRowId",
        ct."contentType",
        ct."contentId" AS "polymorphicId",
        ct."sequenceNumber" AS "contentSequence",
        ct."startDate" AS "contentStartDate",
        COALESCE(ecp.status, 'NOT_STARTED') AS "progressStatus",
        COALESCE(ecp."watchedDuration", 0) AS "watchedDuration",
        ecp."updatedAt" AS "progressUpdatedAt",
        v.title AS "videoTitle",
        v.description AS "videoDescription",
        v.summary AS "videoSummary",
        v.transcript AS "videoTranscript",
        v.external_resources AS "videoExternalResources",
        v."externalVideoId",
        v."durationMs",
        r.title AS "resourceTitle",
        r.description AS "resourceDescription",
        r.type AS "resourceType",
        r.url AS "resourceUrl",
        r.summary AS "resourceSummary",
        r.external_resources AS "resourceExternalResources",
        a.title AS "audioTitle", a.description AS "audioDescription", a.url AS "audioUrl", a.thumbnail_url AS "audioThumbnailUrl",
        a.external_audio_id AS "externalAudioId", a.summary AS "audioSummary", a.transcript AS "audioTranscript",
        a.duration_ms AS "audioDurationMs", a.external_resources AS "audioExternalResources",
        rd.title AS "readTitle", rd.description AS "readDescription", rd.body AS "readBody",
        rd.summary AS "readSummary", rd.external_resources AS "readExternalResources"
      FROM courses c
      LEFT JOIN modules m ON c.id = m."courseId" AND m."deletedAt" IS NULL
      LEFT JOIN contents ct ON m.id = ct."moduleId" AND ct."deletedAt" IS NULL
      LEFT JOIN "enrollmentContentProgress" ecp ON ct.id = ecp."contentId" AND ecp."enrollmentId" = :enrollmentId
      LEFT JOIN videos v ON ct."contentType" = 'VIDEO' AND ct."contentId" = v.id
      LEFT JOIN resources r ON ct."contentType" = 'RESOURCE' AND ct."contentId" = r.id
      LEFT JOIN audios a ON ct."contentType" = 'AUDIO' AND ct."contentId" = a.id
      LEFT JOIN reads rd ON ct."contentType" = 'READ' AND ct."contentId" = rd.id
      WHERE c.id = :courseId
      ${tenantId ? 'AND c."tenantId" = :tenantId' : ''}
      ORDER BY m."sequenceNumber" ASC, ct."sequenceNumber" ASC
    `, {
      replacements: { courseId, enrollmentId: enrollment.id, ...(tenantId ? { tenantId } : {}) },
      type: QueryTypes.SELECT
    });

    if (!rows || rows.length === 0) {
      throw new Error('Course not found');
    }

    const course = {
      id: rows[0].courseId,
      title: rows[0].courseTitle,
      description: rows[0].courseDescription,
      thumbnailUrl: rows[0].courseThumbnailUrl || null,
      modules: [],
      tools: [],
      communityLinks: [],
      enrollmentId: enrollment.id
    };

    const moduleMap = new Map();
    let totalContent = 0;

    for (const row of rows) {
      if (!row.moduleId) continue;

      if (!moduleMap.has(row.moduleId)) {
        moduleMap.set(row.moduleId, {
          id: row.moduleId,
          title: row.moduleTitle,
          description: row.moduleDescription,
          courseId: row.courseId,
          startDate: row.moduleStartDate,
          sequenceNumber: row.moduleSequence,
          contentCount: 0,
          contents: []
        });
      }

      const module = moduleMap.get(row.moduleId);
      if (!row.contentRowId) continue;

      totalContent++;
      const content = {
        id: row.contentRowId,
        contentType: row.contentType,
        contentId: row.polymorphicId,
        sequenceNumber: row.contentSequence,
        startDate: row.contentStartDate,
        progress: mapProgressStatus(row.progressStatus),
        watchedDuration: row.watchedDuration
      };

      if (row.contentType === 'VIDEO') {
        content.title = row.videoTitle;
        content.description = row.videoDescription;
        content.summary = row.videoSummary;
        content.transcript = row.videoTranscript;
        content.externalResources = row.videoExternalResources;
        content.externalVideoId = row.externalVideoId;
        content.durationMs = row.durationMs;
      }

      if (row.contentType === 'RESOURCE') {
        content.title = row.resourceTitle;
        content.description = row.resourceDescription;
        content.type = row.resourceType;
        content.url = row.resourceUrl;
        content.summary = row.resourceSummary;
        content.externalResources = row.resourceExternalResources;
      }

      if (row.contentType === 'AUDIO') {
        Object.assign(content, { title: row.audioTitle, description: row.audioDescription, url: row.audioUrl,
          thumbnailUrl: row.audioThumbnailUrl, externalAudioId: row.externalAudioId,
          summary: row.audioSummary, transcript: row.audioTranscript, durationMs: row.audioDurationMs,
          externalResources: row.audioExternalResources });
      }
      if (row.contentType === 'READ') {
        Object.assign(content, { title: row.readTitle, description: row.readDescription, body: row.readBody,
          summary: row.readSummary, externalResources: row.readExternalResources });
      }

      module.contents.push(content);
      module.contentCount++;
    }

    course.modules = Array.from(moduleMap.values()).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    await this.attachVideoPlaybackData(course);

    course.totalModules = course.modules.length;
    course.totalContent = totalContent;
    course.forms = [];
    course.hasPendingForms = false;

    return course;
  }

  async attachVideoPlaybackData(course) {
    const videoContents = course.modules.flatMap((module) =>
      module.contents.filter((content) => content.contentType === 'VIDEO' && content.externalVideoId)
    );

    if (videoContents.length === 0) return;

    await Promise.all(videoContents.map(async (content) => {
      if (content.externalVideoId.startsWith('youtube:')) {
        const youtubeId = content.externalVideoId.replace('youtube:', '').trim();
        content.videoData = {
          provider: 'youtube',
          youtubeVideoId: youtubeId,
          youtubeEmbedUrl: `https://www.youtube.com/embed/${youtubeId}`,
          thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
          durationMs: content.durationMs || null,
          duration: content.durationMs ? content.durationMs / 1000 : null,
          status: 'ready'
        };
        return;
      }

      try {
        const asset = await getGumletAsset(content.externalVideoId);
        content.videoData = {
          gumletResourceId: content.externalVideoId,
          thumbnail: Array.isArray(asset.output?.thumbnail_url) ? asset.output.thumbnail_url[0] : asset.output?.thumbnail_url,
          duration: asset.input?.duration || (content.durationMs ? content.durationMs / 1000 : null),
          durationMs: content.durationMs || (asset.input?.duration ? Math.round(asset.input.duration * 1000) : null),
          hls: asset.output?.playback_url,
          dashUrl: asset.output?.dash_playback_url,
          status: asset.status,
          title: asset.input?.title
        };
      } catch (error) {
        content.videoData = {
          gumletResourceId: content.externalVideoId,
          duration: content.durationMs ? content.durationMs / 1000 : null,
          durationMs: content.durationMs,
          error: 'Video streaming temporarily unavailable'
        };
      }
    }));
  }

  async getVideoStreamByContentId(contentId, userEmail, tenantId = null) {
    return this.getMediaStreamByContentId(contentId, userEmail, tenantId, 'VIDEO');
  }

  async getAudioStreamByContentId(contentId, userEmail, tenantId = null) {
    return this.getMediaStreamByContentId(contentId, userEmail, tenantId, 'AUDIO');
  }

  async getMediaStreamByContentId(contentId, userEmail, tenantId, contentType) {
    try {
      const user = await resolveUser(userEmail);

      const content = await Content.findOne({
        where: { id: contentId, contentType }
      });

      if (!content) throw new Error('Video content not found');

      const audio = contentType === 'AUDIO';
      const video = await (audio ? Audio : Video).findByPk(content.contentId);
      const externalId = audio ? video?.externalAudioId : video?.externalVideoId;
      if (!externalId) {
        throw new Error('Video or external video ID not found');
      }

      const { QueryTypes } = require('sequelize');
      const [progressData] = await sequelize.query(`
        SELECT ecp."watchedDuration", ecp.status
        FROM "enrollmentContentProgress" ecp
        JOIN enrollments e ON ecp."enrollmentId" = e.id
        WHERE ecp."contentId" = :contentId AND e."userId" = :userId
        LIMIT 1
      `, {
        replacements: { contentId, userId: user.id },
        type: QueryTypes.SELECT
      });

      const [courseInfo] = await sequelize.query(`
        SELECT
          c.id AS "courseId",
          c.title AS "courseTitle",
          m.id AS "moduleId",
          m.title AS "moduleTitle",
          e.id AS "enrollmentId"
        FROM contents ct
        JOIN modules m ON ct."moduleId" = m.id
        JOIN courses c ON m."courseId" = c.id
        LEFT JOIN enrollments e ON c.id = e."courseId" AND e."userId" = :userId AND e."deletedAt" IS NULL
        WHERE ct.id = :contentId
        AND ct."deletedAt" IS NULL AND m."deletedAt" IS NULL
        ${tenantId ? 'AND c."tenantId" = :tenantId' : ''}
      `, {
        replacements: { contentId, userId: user.id, ...(tenantId ? { tenantId } : {}) },
        type: QueryTypes.SELECT
      });

      if (!courseInfo) throw new Error('Content not found in any course');
      if (!courseInfo.enrollmentId) {
        throw new Error(`User is not enrolled in the course "${courseInfo.courseTitle}" that contains this video`);
      }

      const linkedResources = await this.getContentAttachments(content.id);

      if (!audio && externalId.startsWith('youtube:')) {
        const youtubeId = externalId.replace('youtube:', '').trim();
        return {
          success: true,
          data: {
            contentId: content.id,
            videoId: video.id,
            provider: 'youtube',
            youtubeVideoId: youtubeId,
            youtubeEmbedUrl: `https://www.youtube.com/embed/${youtubeId}`,
            title: video.title,
            description: video.description,
            summary: video.summary || null,
            thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
            duration: video.durationMs ? video.durationMs / 1000 : null,
            durationMs: video.durationMs || null,
            hls: null,
            dashUrl: null,
            status: 'ready',
            linkedResources,
            linkedAssignments: [],
            progress: mapProgressStatus(progressData?.status),
            watchedDuration: progressData?.watchedDuration || 0,
            courseContext: courseInfo
          }
        };
      }

      const asset = await (audio ? getGumletAudioAsset : getGumletAsset)(externalId);
      const needsSummary = !video.summary || video.summary.trim().length < 50;
      const hasTranscription = asset.output?.transcription_word_level_timestamps;

      if (!audio && needsSummary && hasTranscription) {
        this.generateSummaryInBackground(video.id, asset.output.transcription_word_level_timestamps, video.title);
      }

      return {
        success: true,
        data: {
          contentId: content.id,
          ...(audio ? { audioId: video.id } : { videoId: video.id }),
          gumletResourceId: externalId,
          title: video.title,
          description: video.description,
          summary: video.summary || null,
          thumbnail: (audio && video.thumbnailUrl) || (Array.isArray(asset.output?.thumbnail_url) ? asset.output.thumbnail_url[0] : asset.output?.thumbnail_url),
          duration: asset.input?.duration || (video.durationMs ? video.durationMs / 1000 : null),
          durationMs: video.durationMs || (asset.input?.duration ? Math.round(asset.input.duration * 1000) : null),
          hls: asset.output?.playback_url,
          dashUrl: asset.output?.dash_playback_url,
          status: asset.status,
          gumletTitle: asset.input?.title,
          linkedResources,
          linkedAssignments: [],
          progress: mapProgressStatus(progressData?.status),
          watchedDuration: progressData?.watchedDuration || 0,
          courseContext: courseInfo
        }
      };
    } catch (error) {
      console.error('Error fetching video stream:', error);
      return {
        success: false,
        error: error.message,
        data: {
          contentId,
          error: 'Video streaming temporarily unavailable'
        }
      };
    }
  }

  async getContentAttachments(contentId) {
    const attachments = await ContentAttachment.findAll({
      where: { contentId },
      include: [{
        model: Resource,
        as: 'resource',
        attributes: ['id', 'title', 'description', 'url', 'type']
      }],
      order: [['sequenceNumber', 'ASC']]
    });

    return attachments
      .filter((attachment) => attachment.resource)
      .map((attachment) => ({
        id: attachment.id,
        title: attachment.resource.title,
        description: attachment.resource.description,
        url: attachment.resource.url,
        type: attachment.resource.type,
        sequence: attachment.sequenceNumber
      }));
  }

  async updateContentProgress(userEmail, contentId, { watchedDuration, status } = {}, tenantId = null) {
    const { QueryTypes } = require('sequelize');
    const user = await resolveUser(userEmail);

    const content = await Content.findOne({
      where: { id: contentId },
      attributes: ['id', 'moduleId']
    });
    if (!content) throw new Error('Content not found');

    const [enrollmentRow] = await sequelize.query(`
      SELECT e.id AS "enrollmentId"
      FROM enrollments e
      JOIN courses c ON e."courseId" = c.id
      JOIN modules m ON m."courseId" = c.id
      WHERE m.id = :moduleId AND e."userId" = :userId AND e."deletedAt" IS NULL
      ${tenantId ? 'AND c."tenantId" = :tenantId' : ''}
      LIMIT 1
    `, {
      replacements: { moduleId: content.moduleId, userId: user.id, ...(tenantId ? { tenantId } : {}) },
      type: QueryTypes.SELECT
    });

    if (!enrollmentRow) throw new Error('User is not enrolled in the course for this content');

    if (status !== undefined && !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(status)) throw new Error('Invalid progress status');
    if (watchedDuration !== undefined && (!Number.isInteger(watchedDuration) || watchedDuration < 0)) throw new Error('Invalid watched duration');

    return sequelize.transaction(async transaction => {
      // Serialize competing pause/ended requests so a late pause cannot undo completion.
      const enrollment = await Enrollment.findByPk(enrollmentRow.enrollmentId, { transaction, lock: transaction.LOCK.UPDATE });
      const [record] = await EnrollmentContentProgress.findOrCreate({
        where: { enrollmentId: enrollment.id, contentId },
        defaults: { moduleId: content.moduleId, status: 'NOT_STARTED', watchedDuration: 0 },
        transaction
      });
      const rank = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2 };
      const nextStatus = status || 'IN_PROGRESS';
      await record.update({
        status: rank[nextStatus] > rank[record.status] ? nextStatus : record.status,
        watchedDuration: Math.max(record.watchedDuration || 0, watchedDuration || 0)
      }, { transaction });
      await enrollment.update({ lastAccessedAt: new Date() }, { transaction });
      return record;
    });
  }

  generateSummaryInBackground(videoId, transcriptionUrl, videoTitle) {
    setImmediate(() => {
      (async () => {
        const summary = await summaryService.generateSummaryFromUrl(transcriptionUrl, videoTitle);
        await Video.update({ summary }, { where: { id: videoId } });
      })().catch((err) => {
        console.error(`[SummaryGen] Failed for video ${videoId}: ${err.message}`);
      });
    });
  }
}

module.exports = new CourseService();
