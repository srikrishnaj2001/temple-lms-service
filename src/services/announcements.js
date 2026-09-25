'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { sanitize, buildPreview } = require('../utils/sanitizeHtml');

const TITLE_MAX = 150;
const BODY_HTML_MAX = 10000;
const PIN_CAP_PER_COURSE = 5;

function toInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toDateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function normalizeCourseIds(homeCourseId, crossPostCourseIds = []) {
  const homeId = toInt(homeCourseId);
  const crossIds = Array.isArray(crossPostCourseIds)
    ? crossPostCourseIds.map(toInt).filter((id) => id && id !== homeId)
    : [];
  return [homeId, ...Array.from(new Set(crossIds))].filter(Boolean);
}

function validatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['Request body is required'];

  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    errors.push('title is required');
  } else if (payload.title.length > TITLE_MAX) {
    errors.push(`title must be ${TITLE_MAX} characters or fewer`);
  }

  if (typeof payload.body_html !== 'string' || !payload.body_html.trim()) {
    errors.push('body_html is required');
  } else if (payload.body_html.length > BODY_HTML_MAX) {
    errors.push(`body_html must be ${BODY_HTML_MAX} characters or fewer`);
  }

  if (!toInt(payload.home_course_id)) {
    errors.push('home_course_id is required');
  }

  if (payload.cross_post_course_ids && !Array.isArray(payload.cross_post_course_ids)) {
    errors.push('cross_post_course_ids must be an array');
  }

  if (payload.expiry_at && !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.expiry_at).slice(0, 10))) {
    errors.push('expiry_at must be in YYYY-MM-DD format');
  }

  return errors;
}

function serializeBoard(board) {
  const json = typeof board.toJSON === 'function' ? board.toJSON() : board;
  return {
    id: json.id,
    course_id: json.courseId,
    course_title: json.course?.title || null,
    is_home: Boolean(json.isHome),
    is_pinned: Boolean(json.isPinned),
    pinned_at: json.pinnedAt || null,
    attached_at: json.attachedAt || null
  };
}

function serializeAnnouncement(row, boardsOverride) {
  const json = typeof row.toJSON === 'function' ? row.toJSON() : row;
  const boards = boardsOverride || json.courseLinks || [];
  const expiryAt = toDateOnly(json.expiryAt);
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: json.id,
    title: json.title,
    body_html: json.bodyHtml,
    body_preview: json.bodyPreview,
    image_url: json.imageUrl,
    expiry_at: expiryAt,
    is_expired: Boolean(expiryAt && expiryAt < today),
    author_user_id: json.authorUserId,
    author: json.author
      ? {
          id: json.author.id,
          name: json.author.name,
          image_url: json.author.imageUrl || null
        }
      : null,
    created_at: json.createdAt,
    updated_at: json.updatedAt,
    boards: boards.map(serializeBoard)
  };
}

async function verifyCourses(courseIds) {
  const courses = await db.Course.findAll({ where: { id: courseIds } });
  if (courses.length !== courseIds.length) {
    const found = new Set(courses.map((course) => course.id));
    const missing = courseIds.filter((id) => !found.has(id));
    return { success: false, error: `Unknown course id(s): ${missing.join(', ')}` };
  }
  return { success: true, courses };
}

async function resolveAuthorId(payload, authorEmail, currentAuthorId = null) {
  if (payload.author_user_id !== undefined) {
    if (!payload.author_user_id) return null;
    const explicitAuthor = await db.User.findByPk(Number(payload.author_user_id));
    return explicitAuthor ? explicitAuthor.id : currentAuthorId;
  }

  if (!authorEmail) return currentAuthorId;
  const author = await db.User.findOne({
    where: { email: db.User.normalizeEmail(authorEmail) }
  });
  return author ? author.id : currentAuthorId;
}

async function createAnnouncement(payload, authorEmail) {
  const errors = validatePayload(payload);
  if (errors.length) return { success: false, error: errors.join('; ') };

  const homeCourseId = toInt(payload.home_course_id);
  const allCourseIds = normalizeCourseIds(homeCourseId, payload.cross_post_course_ids);
  const courseCheck = await verifyCourses(allCourseIds);
  if (!courseCheck.success) return courseCheck;

  const homeCourse = courseCheck.courses.find((course) => course.id === homeCourseId);
  const cleanHtml = sanitize(payload.body_html);
  const transaction = await db.sequelize.transaction();

  try {
    const announcement = await db.Announcement.create({
      title: payload.title.trim(),
      bodyHtml: cleanHtml,
      bodyPreview: buildPreview(cleanHtml),
      imageUrl: payload.image_url || null,
      authorUserId: await resolveAuthorId(payload, authorEmail),
      expiryAt: payload.expiry_at || null,
      tenantId: homeCourse?.tenantId || null
    }, { transaction });

    await db.AnnouncementCourse.bulkCreate(
      allCourseIds.map((courseId) => ({
        announcementId: announcement.id,
        courseId,
        isHome: courseId === homeCourseId
      })),
      { transaction }
    );

    await transaction.commit();
    return getAnnouncementById(announcement.id);
  } catch (error) {
    await transaction.rollback();
    return { success: false, error: error.message, message: 'Failed to create announcement' };
  }
}

async function listAnnouncements({ page = 1, limit = 20, status = 'all', courseId } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const today = new Date().toISOString().slice(0, 10);

  const where = {};
  if (status === 'active') {
    where[Op.or] = [{ expiryAt: null }, { expiryAt: { [Op.gte]: today } }];
  } else if (status === 'expired') {
    where.expiryAt = { [Op.lt]: today };
  }

  const include = [
    {
      model: db.AnnouncementCourse,
      as: 'courseLinks',
      required: Boolean(courseId),
      where: courseId ? { courseId: Number(courseId) } : undefined,
      include: [{ model: db.Course, as: 'course', attributes: ['id', 'title'] }]
    },
    {
      model: db.User,
      as: 'author',
      attributes: ['id', 'name', 'imageUrl'],
      required: false
    }
  ];

  const { rows, count } = await db.Announcement.findAndCountAll({
    where,
    include,
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    distinct: true,
    subQuery: false
  });

  let boardsByAnnouncementId = null;
  if (courseId && rows.length) {
    const allBoards = await db.AnnouncementCourse.findAll({
      where: { announcementId: rows.map((row) => row.id) },
      include: [{ model: db.Course, as: 'course', attributes: ['id', 'title'] }]
    });
    boardsByAnnouncementId = allBoards.reduce((acc, board) => {
      (acc[board.announcementId] = acc[board.announcementId] || []).push(board);
      return acc;
    }, {});
  }

  return {
    success: true,
    data: {
      announcements: rows.map((row) => serializeAnnouncement(
        row,
        boardsByAnnouncementId ? boardsByAnnouncementId[row.id] || [] : undefined
      )),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / safeLimit))
      }
    }
  };
}

async function getAnnouncementById(id) {
  const announcement = await db.Announcement.findByPk(id, {
    include: [
      {
        model: db.AnnouncementCourse,
        as: 'courseLinks',
        include: [{ model: db.Course, as: 'course', attributes: ['id', 'title'] }]
      },
      {
        model: db.User,
        as: 'author',
        attributes: ['id', 'name', 'imageUrl'],
        required: false
      }
    ]
  });

  if (!announcement) return { success: false, error: 'Announcement not found' };
  return { success: true, data: { announcement: serializeAnnouncement(announcement) } };
}

async function getPinContext(announcementId) {
  const announcement = await db.Announcement.findByPk(announcementId, {
    include: [{
      model: db.AnnouncementCourse,
      as: 'courseLinks',
      include: [{ model: db.Course, as: 'course', attributes: ['id', 'title'] }]
    }]
  });

  if (!announcement) return { success: false, error: 'Announcement not found' };

  const courseIds = announcement.courseLinks.map((board) => board.courseId);
  const counts = courseIds.length
    ? await db.AnnouncementCourse.findAll({
        attributes: [
          'courseId',
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'pinned_count']
        ],
        where: { courseId: courseIds, isPinned: true },
        group: ['courseId'],
        raw: true
      })
    : [];

  const pinnedCountByCourse = counts.reduce((acc, row) => {
    acc[row.courseId] = Number(row.pinned_count);
    return acc;
  }, {});

  return {
    success: true,
    data: {
      announcement_id: announcement.id,
      pin_cap: PIN_CAP_PER_COURSE,
      boards: announcement.courseLinks.map((board) => ({
        course_id: board.courseId,
        course_title: board.course?.title || null,
        is_pinned: Boolean(board.isPinned),
        course_pinned_count: pinnedCountByCourse[board.courseId] || 0
      }))
    }
  };
}

async function updatePins(announcementId, pinnedCourseIdsInput = []) {
  if (!Array.isArray(pinnedCourseIdsInput)) {
    return { success: false, error: 'pinned_course_ids must be an array' };
  }

  const targetPinned = new Set(pinnedCourseIdsInput.map(toInt).filter(Boolean));
  const announcement = await db.Announcement.findByPk(announcementId, {
    include: [{ model: db.AnnouncementCourse, as: 'courseLinks' }]
  });

  if (!announcement) return { success: false, error: 'Announcement not found' };

  const attachedIds = new Set(announcement.courseLinks.map((board) => board.courseId));
  const unknown = [...targetPinned].filter((id) => !attachedIds.has(id));
  if (unknown.length) {
    return { success: false, error: `Course id(s) not attached to this announcement: ${unknown.join(', ')}` };
  }

  const toPin = announcement.courseLinks.filter((board) => !board.isPinned && targetPinned.has(board.courseId));
  const toUnpin = announcement.courseLinks.filter((board) => board.isPinned && !targetPinned.has(board.courseId));

  if (toPin.length) {
    const counts = await db.AnnouncementCourse.findAll({
      attributes: [
        'courseId',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'pinned_count']
      ],
      where: { courseId: toPin.map((board) => board.courseId), isPinned: true },
      group: ['courseId'],
      raw: true
    });
    const currentPinned = counts.reduce((acc, row) => {
      acc[row.courseId] = Number(row.pinned_count);
      return acc;
    }, {});
    const unpinByCourse = toUnpin.reduce((acc, board) => {
      acc[board.courseId] = (acc[board.courseId] || 0) + 1;
      return acc;
    }, {});

    for (const board of toPin) {
      const after = (currentPinned[board.courseId] || 0) + 1 - (unpinByCourse[board.courseId] || 0);
      if (after > PIN_CAP_PER_COURSE) {
        return { success: false, error: `Course ${board.courseId} already has ${PIN_CAP_PER_COURSE} pinned announcements` };
      }
    }
  }

  const transaction = await db.sequelize.transaction();
  try {
    const now = new Date();
    for (const board of toPin) {
      await board.update({ isPinned: true, pinnedAt: now }, { transaction });
    }
    for (const board of toUnpin) {
      await board.update({ isPinned: false, pinnedAt: null }, { transaction });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    return { success: false, error: error.message, message: 'Failed to update pins' };
  }

  return getPinContext(announcementId);
}

async function updateAnnouncement(id, payload) {
  const errors = validatePayload(payload);
  if (errors.length) return { success: false, error: errors.join('; ') };

  const announcement = await db.Announcement.findByPk(id, {
    include: [{ model: db.AnnouncementCourse, as: 'courseLinks' }]
  });
  if (!announcement) return { success: false, error: 'Announcement not found' };

  const homeCourseId = toInt(payload.home_course_id);
  const targetCourseIds = normalizeCourseIds(homeCourseId, payload.cross_post_course_ids);
  const courseCheck = await verifyCourses(targetCourseIds);
  if (!courseCheck.success) return courseCheck;

  const homeCourse = courseCheck.courses.find((course) => course.id === homeCourseId);
  const currentBoardsByCourse = new Map(announcement.courseLinks.map((board) => [board.courseId, board]));
  const targetSet = new Set(targetCourseIds);
  const toRemove = announcement.courseLinks.filter((board) => !targetSet.has(board.courseId));
  const toAddCourseIds = targetCourseIds.filter((courseId) => !currentBoardsByCourse.has(courseId));
  const cleanHtml = sanitize(payload.body_html);

  const transaction = await db.sequelize.transaction();
  try {
    await announcement.update({
      title: payload.title.trim(),
      bodyHtml: cleanHtml,
      bodyPreview: buildPreview(cleanHtml),
      imageUrl: payload.image_url || null,
      authorUserId: await resolveAuthorId(payload, null, announcement.authorUserId),
      expiryAt: payload.expiry_at || null,
      tenantId: homeCourse?.tenantId || announcement.tenantId
    }, { transaction });

    for (const board of toRemove) {
      await board.destroy({ transaction });
    }

    if (toAddCourseIds.length) {
      await db.AnnouncementCourse.bulkCreate(
        toAddCourseIds.map((courseId) => ({
          announcementId: announcement.id,
          courseId,
          isHome: courseId === homeCourseId
        })),
        { transaction }
      );
    }

    for (const board of announcement.courseLinks.filter((item) => targetSet.has(item.courseId))) {
      const shouldBeHome = board.courseId === homeCourseId;
      if (board.isHome !== shouldBeHome) {
        await board.update({ isHome: shouldBeHome }, { transaction });
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    return { success: false, error: error.message, message: 'Failed to update announcement' };
  }

  return getAnnouncementById(id);
}

async function deleteAnnouncement(id) {
  const announcement = await db.Announcement.findByPk(id);
  if (!announcement) return { success: false, error: 'Announcement not found' };

  try {
    await announcement.destroy();
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, error: error.message, message: 'Failed to delete announcement' };
  }
}

module.exports = {
  createAnnouncement,
  listAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  getPinContext,
  updatePins
};
