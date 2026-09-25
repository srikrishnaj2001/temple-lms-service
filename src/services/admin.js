'use strict';

const { Op } = require('sequelize');
const {
  Tenant,
  Category,
  Role,
  Course,
  Module,
  Content,
  Video,
  Resource,
  Audio,
  Read,
  User,
  Enrollment,
  EnrollmentContentProgress,
  ContentAttachment,
  AnnouncementCourse,
  sequelize
} = require('../../models');

const intOrNull = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const clean = (value) => (value === '' || value === undefined ? null : value);
const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const toPlain = (record) => (record?.toJSON ? record.toJSON() : record);
const { supplementaryPayload, assetPayload, httpUrl } = require('../utils/lessonContent');

const serializeCourse = (record) => {
  const course = toPlain(record);
  if (!course) return course;
  const modules = course.modules || [];
  return {
    ...course,
    tenant_id: course.tenantId,
    thumbnail_url: course.thumbnailUrl,
    cohorts: course.cohorts || [],
    modules,
    module_count: modules.length
  };
};

const serializeModule = (record) => {
  const module = toPlain(record);
  if (!module) return module;
  return {
    ...module,
    course_id: module.courseId,
    cohort_id: module.courseId,
    sequence_number: module.sequenceNumber,
    start_date: module.startDate,
    end_date: module.endDate,
    contents: module.contents || []
  };
};

const serializeVideo = (record) => {
  const video = toPlain(record);
  if (!video) return video;
  return {
    ...video,
    external_video_id: video.externalVideoId,
    duration_ms: video.durationMs
  };
};

const serializeContent = (record) => {
  const content = toPlain(record);
  if (!content) return content;
  return {
    ...content,
    content_id: content.contentId,
    content_type: content.contentType,
    module_id: content.moduleId,
    sequence_number: content.sequenceNumber,
    start_date: content.startDate
  };
};

const serializeEnrollment = (record) => {
  const enrollment = toPlain(record);
  if (!enrollment) return enrollment;
  const course = enrollment.course ? serializeCourse(enrollment.course) : null;
  return {
    ...enrollment,
    course_id: enrollment.courseId,
    cohort_id: enrollment.courseId,
    course,
    cohort: course
  };
};

class AdminService {
  async getDefaultTenantId() {
    const tenant = await Tenant.findOne({ order: [['createdAt', 'ASC']] });
    return tenant?.id || null;
  }

  mapCoursePayload(data = {}) {
    const tenantId = firstValue(data.tenantId, data.tenant_id);
    const thumbnailUrl = firstValue(data.thumbnailUrl, data.thumbnail_url, data.coverImage, data.cover_image);
    return {
      ...(firstValue(data.title) !== undefined && { title: clean(data.title) }),
      ...(data.description !== undefined && { description: clean(data.description) }),
      ...((data.thumbnailUrl !== undefined || data.thumbnail_url !== undefined) && { thumbnailUrl: clean(data.thumbnailUrl ?? data.thumbnail_url) }),
      ...(tenantId !== undefined && { tenantId: clean(tenantId) })
    };
  }

  mapModulePayload(data = {}) {
    return {
      ...(firstValue(data.title) !== undefined && { title: clean(data.title) }),
      ...(data.description !== undefined && { description: clean(data.description) }),
      ...(firstValue(data.courseId, data.course_id, data.cohort_id) !== undefined && {
        courseId: intOrNull(firstValue(data.courseId, data.course_id, data.cohort_id))
      }),
      ...(firstValue(data.sequenceNumber, data.sequence_number) !== undefined && {
        sequenceNumber: intOrNull(firstValue(data.sequenceNumber, data.sequence_number)) || 1
      }),
      ...((data.startDate !== undefined || data.start_date !== undefined) && {
        startDate: clean(data.startDate !== undefined ? data.startDate : data.start_date) || new Date()
      }),
      ...((data.endDate !== undefined || data.end_date !== undefined) && {
        endDate: clean(data.endDate !== undefined ? data.endDate : data.end_date)
      })
    };
  }

  mapVideoPayload(data = {}) {
    const externalId = data.externalVideoId ?? data.external_video_id;
    if (externalId !== undefined && !/^[a-f0-9]{24}$/i.test(externalId)) throw new Error('Enter a valid Gumlet asset ID');
    return {
      ...supplementaryPayload(data),
      ...(firstValue(data.title) !== undefined && { title: clean(data.title) }),
      ...(data.description !== undefined && { description: clean(data.description) }),
      ...(firstValue(data.externalVideoId, data.external_video_id) !== undefined && {
        externalVideoId: clean(firstValue(data.externalVideoId, data.external_video_id))
      }),
      ...(firstValue(data.durationMs, data.duration_ms) !== undefined && {
        durationMs: clean(firstValue(data.durationMs, data.duration_ms))
      })
    };
  }

  mapResourcePayload(data = {}) {
    return {
      ...supplementaryPayload(data),
      ...(firstValue(data.title) !== undefined && { title: clean(data.title) }),
      ...(data.description !== undefined && { description: clean(data.description) }),
      ...(data.url !== undefined && { url: data.url ? httpUrl(data.url) : null }),
      ...(firstValue(data.type) !== undefined && { type: clean(data.type) })
    };
  }

  mapContentPayload(data = {}) {
    return {
      ...(firstValue(data.contentId, data.content_id) !== undefined && {
        contentId: intOrNull(firstValue(data.contentId, data.content_id))
      }),
      ...(firstValue(data.contentType, data.content_type) !== undefined && {
        contentType: String(firstValue(data.contentType, data.content_type)).toUpperCase()
      }),
      ...(firstValue(data.moduleId, data.module_id) !== undefined && {
        moduleId: intOrNull(firstValue(data.moduleId, data.module_id))
      }),
      ...(firstValue(data.sequenceNumber, data.sequence_number) !== undefined && {
        sequenceNumber: intOrNull(firstValue(data.sequenceNumber, data.sequence_number)) || 1
      }),
      ...((data.startDate !== undefined || data.start_date !== undefined) && {
        startDate: clean(data.startDate !== undefined ? data.startDate : data.start_date) || new Date()
      })
    };
  }

  getContentModel(contentType) {
    if (contentType === 'VIDEO') return Video;
    if (contentType === 'RESOURCE') return Resource;
    if (contentType === 'AUDIO') return Audio;
    if (contentType === 'READ') return Read;
    return null;
  }

  async getNextModuleSequence(courseId, transaction) {
    const maxSequence = await Module.max('sequenceNumber', { where: { courseId }, transaction });
    return (maxSequence || 0) + 1;
  }

  async getNextContentSequence(moduleId, transaction) {
    const maxSequence = await Content.max('sequenceNumber', { where: { moduleId }, transaction });
    return (maxSequence || 0) + 1;
  }

  async getActualContent(content) {
    const ContentModel = this.getContentModel(content.contentType);
    if (!ContentModel) return null;
    const actual = await ContentModel.findByPk(content.contentId);
    return content.contentType === 'VIDEO' ? serializeVideo(actual) : toPlain(actual);
  }

  async cloneActualContent(content, transaction) {
    const actual = await this.getActualContent(content);
    if (!actual) throw new Error(`${content.contentType} record not found for content ${content.id}`);
    if (content.contentType === 'VIDEO') return Video.create(this.mapVideoPayload(actual), { transaction });
    if (['AUDIO', 'READ'].includes(content.contentType)) return this.getContentModel(content.contentType).create(assetPayload(actual, content.contentType), { transaction });
    return Resource.create(this.mapResourcePayload(actual), { transaction });
  }

  async getAllTopLevelCourses(page = 1, limit = 50) {
    return this.getAllCourses(page, limit);
  }

  async getTopLevelCourseById(id) {
    return this.getCourseById(id);
  }

  async createTopLevelCourse(courseData) {
    return this.createCourse(courseData);
  }

  async updateTopLevelCourse(id, updateData) {
    return this.updateCourse(id, updateData);
  }

  async deleteTopLevelCourse(id) {
    return this.deleteCourse(id);
  }

  async canDeleteTopLevelCourse(id) {
    return this.canDeleteCourse(id);
  }

  async getAllCourses(page = 1, limit = 50, tenantId = null) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 50;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Course.findAndCountAll({
        where: tenantId ? { tenantId } : {},
        limit: safeLimit,
        offset: (safePage - 1) * safeLimit,
        distinct: true,
        include: [
          { model: Category, as: 'categories', through: { attributes: [] } },
          { model: Role, as: 'roles', through: { attributes: [] } },
          { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'domain'], required: false },
          { model: Module, as: 'modules', attributes: ['id', 'title', 'sequenceNumber'], required: false }
        ],
        order: [['createdAt', 'DESC']]
      });
      return {
        success: true,
        data: {
          courses: rows.map(serializeCourse),
          pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) }
        }
      };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch courses' };
    }
  }

  async getCourseById(id) {
    try {
      const course = await Course.findByPk(id, {
        include: [
          { model: Category, as: 'categories', through: { attributes: [] } },
          { model: Role, as: 'roles', through: { attributes: [] } },
          { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'domain'], required: false },
          { model: Module, as: 'modules', include: [{ model: Content, as: 'contents', required: false }], required: false }
        ],
        order: [[{ model: Module, as: 'modules' }, 'sequenceNumber', 'ASC']]
      });
      if (!course) return { success: false, message: 'Course not found' };
      return { success: true, data: serializeCourse(course) };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch course' };
    }
  }

  async createCourse(courseData) {
    try {
      const payload = this.mapCoursePayload(courseData);
      if (!payload.tenantId) payload.tenantId = await this.getDefaultTenantId();
      const course = await sequelize.transaction(async transaction => {
        if (!payload.title?.trim()) throw new Error('Course title is required');
        if (payload.thumbnailUrl) payload.thumbnailUrl = httpUrl(payload.thumbnailUrl);
        const row = await Course.create(payload, { transaction });
        await this.setCourseTags(row, courseData, transaction);
        return row;
      });
      return this.getCourseById(course.id);
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to create course' };
    }
  }

  async updateCourse(id, updateData) {
    try {
      const course = await Course.findByPk(id);
      if (!course) return { success: false, message: 'Course not found' };
      await sequelize.transaction(async transaction => {
        const payload = this.mapCoursePayload(updateData);
        if (payload.title !== undefined && !payload.title?.trim()) throw new Error('Course title is required');
        if (payload.thumbnailUrl) payload.thumbnailUrl = httpUrl(payload.thumbnailUrl);
        await course.update(payload, { transaction });
        await this.setCourseTags(course, updateData, transaction);
      });
      return this.getCourseById(id);
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update course' };
    }
  }

  async deleteCourse(id) {
    try {
      const check = await this.canDeleteCourse(id);
      if (!check.data?.canDelete) return { success: false, message: check.data?.reason || 'Cannot delete course' };
      const deleted = await sequelize.transaction(async transaction => {
        const archived = await Module.findAll({ where: { courseId: id }, paranoid: false, transaction });
        const moduleIds = archived.map(row => row.id);
        await Content.destroy({ where: { moduleId: moduleIds }, force: true, transaction });
        await Module.destroy({ where: { id: moduleIds }, force: true, transaction });
        // Active enrollments must be removed first; purge only their archived rows.
        await Enrollment.destroy({ where: { courseId: id, deletedAt: { [Op.ne]: null } }, force: true, transaction });
        await AnnouncementCourse.destroy({ where: { courseId: id }, force: true, transaction });
        return Course.destroy({ where: { id }, transaction });
      });
      if (!deleted) return { success: false, message: 'Course not found' };
      return { success: true, message: 'Course deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete course' };
    }
  }

  async setCourseTags(course, data, transaction) {
    for (const [field, Model, setter] of [['categoryIds', Category, 'setCategories'], ['roleIds', Role, 'setRoles']]) {
      if (data[field] === undefined) continue;
      if (!Array.isArray(data[field]) || data[field].some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) throw new Error(`Invalid ${field}`);
      const ids = [...new Set(data[field].map(Number))];
      if (await Model.count({ where: { id: ids }, transaction }) !== ids.length) throw new Error(`Unknown ${field}`);
      await course[setter](ids, { transaction });
    }
  }

  async canDeleteCourse(id) {
    try {
      const [modules, enrollments] = await Promise.all([
        Module.count({ where: { courseId: id } }),
        Enrollment.count({ where: { courseId: id } })
      ]);
      const canDelete = modules === 0 && enrollments === 0;
      return { success: true, data: { canDelete, reason: canDelete ? null : `Course has ${modules} module(s) and ${enrollments} enrollment(s)` } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getAllModules(page = 1, limit = 50) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 50;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Module.findAndCountAll({
        limit: safeLimit,
        offset: (safePage - 1) * safeLimit,
        distinct: true,
        include: [
          { model: Course, as: 'course', attributes: ['id', 'title'], required: false },
          { model: Content, as: 'contents', attributes: ['id', 'contentType'], required: false }
        ],
        order: [['courseId', 'ASC'], ['sequenceNumber', 'ASC']]
      });
      return {
        success: true,
        data: {
          modules: rows.map(serializeModule),
          pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) }
        }
      };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch modules' };
    }
  }

  async getModulesByCourse(courseId, page = 1, limit = 100) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 100;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Module.findAndCountAll({
        where: { courseId },
        limit: safeLimit,
        offset: (safePage - 1) * safeLimit,
        include: [{ model: Content, as: 'contents', attributes: ['id', 'contentType'], required: false }],
        order: [['sequenceNumber', 'ASC']]
      });
      return {
        success: true,
        data: {
          modules: rows.map(serializeModule),
          pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) }
        }
      };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch course modules' };
    }
  }

  async getModuleById(id) {
    try {
      const module = await Module.findByPk(id, {
        include: [
          { model: Course, as: 'course', attributes: ['id', 'title'], required: false },
          { model: Content, as: 'contents', required: false }
        ]
      });
      if (!module) return { success: false, message: 'Module not found' };
      return { success: true, data: serializeModule(module) };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch module' };
    }
  }

  async createModule(moduleData) {
    try {
      const payload = this.mapModulePayload(moduleData);
      if (!payload.courseId) return { success: false, message: 'Course is required' };
      if (!payload.startDate) payload.startDate = new Date();
      if (!payload.sequenceNumber) payload.sequenceNumber = await this.getNextModuleSequence(payload.courseId);
      const module = await Module.create(payload);
      return { success: true, data: serializeModule(module), message: 'Module created successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to create module' };
    }
  }

  async updateModule(id, moduleData) {
    try {
      const module = await Module.findByPk(id);
      if (!module) return { success: false, message: 'Module not found' };
      await module.update(this.mapModulePayload(moduleData));
      return this.getModuleById(id);
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update module' };
    }
  }

  async deleteModule(id) {
    try {
      const check = await this.canDeleteModule(id);
      if (!check.data?.canDelete) return { success: false, message: check.data?.reason || 'Cannot delete module' };
      const deleted = await Module.destroy({ where: { id } });
      if (!deleted) return { success: false, message: 'Module not found' };
      return { success: true, message: 'Module deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete module' };
    }
  }

  async canDeleteModule(id) {
    try {
      const contentCount = await Content.count({ where: { moduleId: id } });
      return { success: true, data: { canDelete: contentCount === 0, reason: contentCount ? `Module has ${contentCount} content item(s)` : null } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async copyModule(id, copyData = {}) {
    const transaction = await sequelize.transaction();
    try {
      const destinationCourseId = intOrNull(firstValue(copyData.destination_course_id, copyData.destinationCourseId, copyData.course_id, copyData.courseId));
      const sourceModule = await Module.findByPk(id, { include: [{ model: Content, as: 'contents' }], transaction });
      if (!sourceModule) throw new Error('Source module not found');
      if (!destinationCourseId || !(await Course.findByPk(destinationCourseId, { transaction }))) throw new Error('Destination course not found');
      const module = await Module.create({
        title: copyData.title || `${sourceModule.title} Copy`,
        description: sourceModule.description,
        courseId: destinationCourseId,
        startDate: copyData.start_date || sourceModule.startDate || new Date(),
        endDate: sourceModule.endDate,
        sequenceNumber: await this.getNextModuleSequence(destinationCourseId, transaction)
      }, { transaction });
      for (const [index, content] of (sourceModule.contents || []).entries()) {
        const clonedActual = await this.cloneActualContent(content, transaction);
        await Content.create({
          moduleId: module.id,
          contentType: content.contentType,
          contentId: clonedActual.id,
          sequenceNumber: index + 1,
          startDate: content.startDate || new Date()
        }, { transaction });
      }
      await transaction.commit();
      return { success: true, data: serializeModule(module), message: 'Module copied successfully' };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message, message: 'Failed to copy module' };
    }
  }

  async getAllVideos(page = 1, limit = 50) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 50;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Video.findAndCountAll({ limit: safeLimit, offset: (safePage - 1) * safeLimit, order: [['createdAt', 'DESC']] });
      return { success: true, data: { videos: rows.map(serializeVideo), pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) } } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch videos' };
    }
  }

  async getVideoById(id) {
    try {
      const video = await Video.findByPk(id);
      if (!video) return { success: false, message: 'Video not found' };
      return { success: true, data: serializeVideo(video) };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch video' };
    }
  }

  async createVideo(videoData) {
    try {
      const video = await Video.create(this.mapVideoPayload(videoData));
      return { success: true, data: serializeVideo(video), message: 'Video created successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to create video' };
    }
  }

  async updateVideo(id, videoData) {
    try {
      const video = await Video.findByPk(id);
      if (!video) return { success: false, message: 'Video not found' };
      await video.update(this.mapVideoPayload(videoData));
      return { success: true, data: serializeVideo(video), message: 'Video updated successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update video' };
    }
  }

  async deleteVideo(id) {
    try {
      const references = await Content.count({ where: { contentType: 'VIDEO', contentId: id } });
      if (references) return { success: false, message: `Video is used in ${references} content item(s)` };
      const deleted = await Video.destroy({ where: { id } });
      if (!deleted) return { success: false, message: 'Video not found' };
      return { success: true, message: 'Video deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete video' };
    }
  }

  async getAllResources(page = 1, limit = 500) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 500;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Resource.findAndCountAll({ limit: safeLimit, offset: (safePage - 1) * safeLimit, order: [['createdAt', 'DESC']] });
      return { success: true, data: { resources: rows.map(toPlain), pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) } } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch resources' };
    }
  }

  async searchResources(query = '', limit = 20) {
    try {
      const rows = await Resource.findAll({
        where: query ? { title: { [Op.iLike]: `%${query}%` } } : {},
        limit: Number.parseInt(limit, 10) || 20,
        order: [['title', 'ASC']]
      });
      return { success: true, data: { resources: rows.map(toPlain) } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getResourceById(id) {
    try {
      const resource = await Resource.findByPk(id);
      if (!resource) return { success: false, message: 'Resource not found' };
      return { success: true, data: toPlain(resource) };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch resource' };
    }
  }

  async createResource(resourceData) {
    try {
      const resource = await Resource.create(this.mapResourcePayload(resourceData));
      return { success: true, data: toPlain(resource), message: 'Resource created successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to create resource' };
    }
  }

  async updateResource(id, resourceData) {
    try {
      const resource = await Resource.findByPk(id);
      if (!resource) return { success: false, message: 'Resource not found' };
      await resource.update(this.mapResourcePayload(resourceData));
      return { success: true, data: toPlain(resource), message: 'Resource updated successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update resource' };
    }
  }

  async deleteResource(id) {
    try {
      const references = await Content.count({ where: { contentType: 'RESOURCE', contentId: id } });
      if (references) return { success: false, message: `Resource is used in ${references} content item(s)` };
      const deleted = await Resource.destroy({ where: { id } });
      if (!deleted) return { success: false, message: 'Resource not found' };
      return { success: true, message: 'Resource deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete resource' };
    }
  }

  async getAllContents(page = 1, limit = 100) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 100;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Content.findAndCountAll({
        limit: safeLimit,
        offset: (safePage - 1) * safeLimit,
        include: [{ model: Module, as: 'module', include: [{ model: Course, as: 'course' }], required: false }],
        order: [['moduleId', 'ASC'], ['sequenceNumber', 'ASC']]
      });
      const contents = await Promise.all(rows.map(async (content) => ({ ...serializeContent(content), actualContent: await this.getActualContent(content) })));
      return { success: true, data: { contents, pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) } } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch contents' };
    }
  }

  async getContentsByModule(moduleId) {
    try {
      const rows = await Content.findAll({ where: { moduleId }, order: [['sequenceNumber', 'ASC']] });
      const contents = await Promise.all(rows.map(async (content) => ({ ...serializeContent(content), actualContent: await this.getActualContent(content) })));
      return { success: true, data: { contents } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch module contents' };
    }
  }

  async getContentById(id) {
    try {
      const content = await Content.findByPk(id, { include: [{ model: Module, as: 'module', required: false }] });
      if (!content) return { success: false, message: 'Content not found' };
      return { success: true, data: { ...serializeContent(content), actualContent: await this.getActualContent(content) } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch content' };
    }
  }

  async createContent(contentData) {
    try {
      const payload = this.mapContentPayload(contentData);
      if (!payload.moduleId) return { success: false, message: 'Module is required' };
      if (!payload.contentId || !payload.contentType) return { success: false, message: 'Content selection is required' };
      if (!payload.startDate) payload.startDate = new Date();
      if (!payload.sequenceNumber) payload.sequenceNumber = await this.getNextContentSequence(payload.moduleId);
      const ContentModel = this.getContentModel(payload.contentType);
      if (!ContentModel || !(await ContentModel.findByPk(payload.contentId))) return { success: false, message: `${payload.contentType} record not found` };
      const content = await Content.create(payload);
      return { success: true, data: serializeContent(content), message: 'Content created successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to create content' };
    }
  }

  async updateContent(id, contentData) {
    try {
      const content = await Content.findByPk(id);
      if (!content) return { success: false, message: 'Content not found' };
      const payload = this.mapContentPayload(contentData);
      const ContentModel = this.getContentModel(payload.contentType || content.contentType);
      if (!ContentModel || !(await ContentModel.findByPk(payload.contentId || content.contentId))) return { success: false, message: 'Content selection does not exist' };
      if (payload.moduleId && !(await Module.findByPk(payload.moduleId))) return { success: false, message: 'Module does not exist' };
      await content.update(payload);
      return this.getContentById(id);
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update content' };
    }
  }

  async deleteContent(id) {
    try {
      const deleted = await Content.destroy({ where: { id } });
      if (!deleted) return { success: false, message: 'Content not found' };
      return { success: true, message: 'Content deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete content' };
    }
  }

  async copyContent(copyData = {}) {
    const transaction = await sequelize.transaction();
    try {
      const destinationModuleId = intOrNull(firstValue(copyData.destination_module_id, copyData.destinationModuleId, copyData.module_id, copyData.moduleId));
      const contentIds = Array.isArray(copyData.content_ids) ? copyData.content_ids : copyData.contentIds;
      if (!destinationModuleId || !(await Module.findByPk(destinationModuleId, { transaction }))) throw new Error('Destination module not found');
      const sourceContents = await Content.findAll({ where: { id: (contentIds || []).map(intOrNull).filter(Boolean) }, order: [['sequenceNumber', 'ASC']], transaction });
      const created = [];
      let nextSequence = await this.getNextContentSequence(destinationModuleId, transaction);
      for (const content of sourceContents) {
        const clonedActual = await this.cloneActualContent(content, transaction);
        const row = await Content.create({
          moduleId: destinationModuleId,
          contentType: content.contentType,
          contentId: clonedActual.id,
          sequenceNumber: nextSequence,
          startDate: content.startDate || new Date()
        }, { transaction });
        created.push(row);
        nextSequence += 1;
      }
      await transaction.commit();
      return { success: true, data: { contents: created.map(serializeContent) }, message: 'Content copied successfully' };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message, message: 'Failed to copy content' };
    }
  }

  async getAllUsers(page = 1, limit = 100) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 100;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await User.findAndCountAll({ limit: safeLimit, offset: (safePage - 1) * safeLimit, order: [['createdAt', 'DESC']] });
      return { success: true, data: { users: rows, pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) } } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch users' };
    }
  }

  async searchUsers(params = {}) {
    try {
      const where = {};
      if (params.email) where.email = { [Op.iLike]: `%${String(params.email).trim()}%` };
      if (params.phone) where.phone = { [Op.iLike]: `%${String(params.phone).trim()}%` };
      const users = await User.findAll({ where, limit: 20, order: [['createdAt', 'DESC']] });
      return { success: true, data: { users } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to search users' };
    }
  }

  async getUserById(id) {
    try {
      const user = await User.findByPk(id);
      if (!user) return { success: false, message: 'User not found' };
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch user' };
    }
  }

  async createUser(userData) {
    try {
      const [user] = await User.findOrCreate({
        where: { email: User.normalizeEmail(userData.email) },
        defaults: {
          name: userData.name,
          email: userData.email,
          phone: userData.phone || 'Not provided',
          imageUrl: userData.imageUrl || userData.image_url || null
        }
      });
      return { success: true, data: user, message: 'User saved successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to create user' };
    }
  }

  async updateUser(id, userData) {
    try {
      const user = await User.findByPk(id);
      if (!user) return { success: false, message: 'User not found' };
      await user.update({
        ...(userData.name !== undefined && { name: userData.name }),
        ...(userData.email !== undefined && { email: userData.email }),
        ...(userData.phone !== undefined && { phone: userData.phone }),
        ...(firstValue(userData.imageUrl, userData.image_url) !== undefined && { imageUrl: clean(firstValue(userData.imageUrl, userData.image_url)) })
      });
      return { success: true, data: user, message: 'User updated successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update user' };
    }
  }

  async deleteUser(id) {
    try {
      if (await Enrollment.count({ where: { userId: id }, paranoid: false })) return { success: false, message: 'User has enrollment history. Remove active access through Enrollments instead.' };
      const deleted = await User.destroy({ where: { id } });
      if (!deleted) return { success: false, message: 'User not found' };
      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete user' };
    }
  }

  async createEnrollment(enrollmentData) {
    const transaction = await sequelize.transaction();
    try {
      const courseId = intOrNull(firstValue(enrollmentData.courseId, enrollmentData.course_id, enrollmentData.cohort_id));
      if (!courseId) throw new Error('Course is required');
      const [user] = await User.findOrCreate({
        where: { email: User.normalizeEmail(enrollmentData.email) },
        defaults: { name: enrollmentData.name, email: enrollmentData.email, phone: enrollmentData.phone || 'Not provided' },
        transaction
      });
      const [enrollment] = await Enrollment.findOrCreate({
        where: { userId: user.id, courseId },
        defaults: { userId: user.id, courseId },
        transaction
      });
      await transaction.commit();
      const course = await Course.findByPk(courseId);
      return { success: true, data: serializeEnrollment({ ...enrollment.toJSON(), user: toPlain(user), course: toPlain(course) }), message: 'Enrollment created successfully' };
    } catch (error) {
      await transaction.rollback();
      return { success: false, error: error.message, message: 'Failed to create enrollment' };
    }
  }

  async getAllEnrollments(page = 1, limit = 100) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 100;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Enrollment.findAndCountAll({
        limit: safeLimit,
        offset: (safePage - 1) * safeLimit,
        include: [
          { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'], required: false },
          { model: Course, as: 'course', attributes: ['id', 'title', 'description'], required: false }
        ],
        order: [['createdAt', 'DESC']]
      });
      return { success: true, data: { enrollments: rows.map(serializeEnrollment), pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) } } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch enrollments' };
    }
  }

  async getEnrollmentById(id) {
    try {
      const enrollment = await Enrollment.findByPk(id, {
        include: [
          { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'], required: false },
          { model: Course, as: 'course', attributes: ['id', 'title', 'description'], required: false }
        ]
      });
      if (!enrollment) return { success: false, message: 'Enrollment not found' };
      return { success: true, data: serializeEnrollment(enrollment) };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch enrollment' };
    }
  }

  async getEnrollmentDetail(id) {
    try {
      const base = await this.getEnrollmentById(id);
      if (!base.success) return base;
      const enrollment = base.data;
      const modules = await Module.findAll({
        where: { courseId: enrollment.course_id },
        include: [{ model: Content, as: 'contents', required: false }],
        order: [['sequenceNumber', 'ASC'], [{ model: Content, as: 'contents' }, 'sequenceNumber', 'ASC']]
      });
      const progressRecords = await EnrollmentContentProgress.findAll({ where: { enrollmentId: id } });
      const progressByContentId = new Map(progressRecords.map((record) => [record.contentId, record]));
      const moduleProgress = await Promise.all(modules.map(async (module) => {
        const contents = await Promise.all((module.contents || []).map(async (content) => {
          const actualContent = await this.getActualContent(content);
          const progress = progressByContentId.get(content.id);
          return {
            content_id: content.id,
            source_content_id: content.contentId,
            content_type: content.contentType,
            title: actualContent?.title || null,
            description: actualContent?.description || null,
            sequence_number: content.sequenceNumber,
            start_date: content.startDate,
            status: progress?.status || 'NOT_STARTED',
            watched_duration: progress?.watchedDuration || 0,
            updated_at: progress?.updatedAt || null
          };
        }));
        const completedContent = contents.filter((item) => item.status === 'COMPLETED').length;
        return {
          id: module.id,
          title: module.title,
          description: module.description,
          sequence_number: module.sequenceNumber,
          start_date: module.startDate,
          totalContent: contents.length,
          completedContent,
          inProgressContent: contents.filter((item) => item.status === 'IN_PROGRESS').length,
          notStartedContent: Math.max(contents.length - completedContent, 0),
          progressPercent: contents.length ? Math.round((completedContent / contents.length) * 100) : 0,
          contents
        };
      }));
      return { success: true, data: { enrollment, moduleProgress, formResponses: [] } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch enrollment detail' };
    }
  }

  async getEnrollmentsByCourse(courseId, page = 1, limit = 1000) {
    try {
      const safeLimit = Number.parseInt(limit, 10) || 1000;
      const safePage = Number.parseInt(page, 10) || 1;
      const { count, rows } = await Enrollment.findAndCountAll({
        where: { courseId },
        limit: safeLimit,
        offset: (safePage - 1) * safeLimit,
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'], required: false }],
        order: [['createdAt', 'DESC']]
      });
      return { success: true, data: { enrollments: rows.map(serializeEnrollment), pagination: { total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) } } };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to fetch course enrollments' };
    }
  }

  async bulkCreateEnrollments(enrollmentData = {}) {
    const courseId = intOrNull(firstValue(enrollmentData.courseId, enrollmentData.course_id, enrollmentData.cohort_id));
    const users = Array.isArray(enrollmentData.users) ? enrollmentData.users : [];
    const successful = [];
    const failed = [];
    for (const userData of users) {
      const result = await this.createEnrollment({ ...userData, course_id: courseId });
      if (result.success) successful.push(result.data);
      else failed.push({ user: userData, error: result.error || result.message });
    }
    return { success: successful.length > 0 || failed.length === 0, data: { successful, failed, summary: { successful: successful.length, failed: failed.length } }, message: 'Bulk enrollment completed' };
  }

  async deleteEnrollment(id) {
    try {
      const deleted = await Enrollment.destroy({ where: { id } });
      if (!deleted) return { success: false, message: 'Enrollment not found' };
      return { success: true, message: 'Enrollment deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete enrollment' };
    }
  }

  async getCommunityLinksByCourse() {
    return { success: true, data: { communityLinks: [] } };
  }

  async createCommunityLink() {
    return { success: true, data: null, message: 'Community links are not enabled in this LMS schema yet' };
  }

  async updateCommunityLink() {
    return { success: true, data: null, message: 'Community links are not enabled in this LMS schema yet' };
  }

  async deleteCommunityLink() {
    return { success: true, message: 'Community link removed' };
  }

  async getAllTools() {
    return { success: true, data: { tools: [] } };
  }

  async createTool() {
    return { success: true, data: null, message: 'Tools are not enabled in this LMS schema yet' };
  }

  async getCohortTools() {
    return { success: true, data: { courseTools: [] } };
  }

  async setCohortTools() {
    return { success: true, data: { courseTools: [] } };
  }

  async getAllForms() {
    return { success: true, data: { forms: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } } };
  }

  async getFormsByCourse() {
    return this.getAllForms();
  }

  async getFormById() {
    return { success: false, message: 'Forms are not enabled in this LMS schema yet' };
  }

  async createForm() {
    return { success: false, message: 'Forms are not enabled in this LMS schema yet' };
  }

  async updateForm() {
    return { success: false, message: 'Forms are not enabled in this LMS schema yet' };
  }

  async deleteForm() {
    return { success: true, message: 'Form removed' };
  }

  async searchAssignments() {
    return { success: true, data: { assignments: [] } };
  }

  async getAllAssignments() {
    return { success: true, data: { assignments: [] } };
  }

  async getVideoAttachments(videoId) {
    try {
      if (!ContentAttachment) return { success: true, data: { attachments: [] } };
      const rows = await ContentAttachment.findAll({
        where: { videoId: intOrNull(videoId) },
        include: [{ model: Resource, as: 'resource', required: false }],
        order: [['createdAt', 'ASC']]
      });
      return { success: true, data: { attachments: rows } };
    } catch {
      return { success: true, data: { attachments: [] } };
    }
  }

  async createVideoAttachment(videoId, data = {}) {
    try {
      if (!ContentAttachment) return { success: true, data: null };
      const resourceId = intOrNull(firstValue(data.resourceId, data.resource_id, data.content_id));
      const attachment = await ContentAttachment.create({
        videoId: intOrNull(videoId),
        resourceId,
        contentType: data.content_type || 'RESOURCE',
        contentId: resourceId
      });
      return { success: true, data: attachment, message: 'Attachment created successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to create attachment' };
    }
  }

  async updateVideoAttachment(id, data = {}) {
    try {
      if (!ContentAttachment) return { success: true, data: null };
      const attachment = await ContentAttachment.findByPk(id);
      if (!attachment) return { success: false, message: 'Attachment not found' };
      await attachment.update(data);
      return { success: true, data: attachment, message: 'Attachment updated successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to update attachment' };
    }
  }

  async deleteVideoAttachment(id) {
    try {
      if (!ContentAttachment) return { success: true, message: 'Attachment deleted successfully' };
      const deleted = await ContentAttachment.destroy({ where: { id } });
      if (!deleted) return { success: false, message: 'Attachment not found' };
      return { success: true, message: 'Attachment deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message, message: 'Failed to delete attachment' };
    }
  }

  async getVideoAttachmentSummary() {
    return { success: true, data: { total: 0 } };
  }
}

module.exports = new AdminService();
