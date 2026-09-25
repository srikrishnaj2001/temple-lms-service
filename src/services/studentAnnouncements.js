'use strict';

const { Op, QueryTypes } = require('sequelize');
const db = require('../../models');

async function resolveStudent(email) {
  if (!email) return null;
  return db.User.findOne({ where: { email: db.User.normalizeEmail(email) } });
}

async function getEnrolledCourseIds(userId, tenantId = null) {
  const include = tenantId ? [{
    model: db.Course,
    as: 'course',
    where: { tenantId },
    required: true,
    attributes: []
  }] : [];

  const rows = await db.Enrollment.findAll({
    where: { userId },
    attributes: ['courseId'],
    include
  });

  return rows.map((row) => row.courseId);
}

function mapToItem(row) {
  const j = row.toJSON();
  const announcement = j.announcement || {};
  const course = j.course || {};
  const isRead = Array.isArray(j.reads) && j.reads.length > 0;

  return {
    announcementCourseId: j.id,
    announcement_course_id: j.id,
    id: announcement.id,
    title: announcement.title,
    bodyHtml: announcement.bodyHtml || null,
    body_html: announcement.bodyHtml || null,
    bodyPreview: announcement.bodyPreview,
    body_preview: announcement.bodyPreview,
    imageUrl: announcement.imageUrl || null,
    image_url: announcement.imageUrl || null,
    expiryAt: announcement.expiryAt || null,
    expiry_at: announcement.expiryAt || null,
    createdAt: announcement.createdAt,
    created_at: announcement.createdAt,
    attachedAt: j.attachedAt,
    attached_at: j.attachedAt,
    isRead,
    is_read: isRead,
    isPinned: j.isPinned,
    is_pinned: j.isPinned,
    author: announcement.author
      ? {
          name: announcement.author.name,
          imageUrl: announcement.author.imageUrl || null,
          image_url: announcement.author.imageUrl || null
        }
      : null,
    course: {
      id: course.id ?? j.courseId,
      title: course.title || null
    }
  };
}

async function listForStudent(email, { page = 1, limit = 20, courseId } = {}, tenantId = null) {
  const { Announcement, AnnouncementCourse, AnnouncementRead, Course } = db;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const student = await resolveStudent(email);
  if (!student) {
    return { success: false, error: 'Unknown student' };
  }

  const enrolledCourseIds = await getEnrolledCourseIds(student.id, tenantId);
  if (enrolledCourseIds.length === 0) {
    return {
      success: true,
      data: {
        announcements: [],
        pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 1 }
      }
    };
  }

  let courseFilter = enrolledCourseIds;
  if (courseId !== undefined && courseId !== null && courseId !== '') {
    const wanted = Number(courseId);
    if (!enrolledCourseIds.includes(wanted)) {
      return {
        success: true,
        data: {
          announcements: [],
          pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 1 }
        }
      };
    }
    courseFilter = [wanted];
  }

  const today = new Date().toISOString().slice(0, 10);
  const { rows, count } = await AnnouncementCourse.findAndCountAll({
    where: { courseId: courseFilter },
    include: [
      {
        model: Announcement,
        as: 'announcement',
        required: true,
        where: {
          [Op.or]: [
            { expiryAt: null },
            { expiryAt: { [Op.gte]: today } }
          ]
        },
        attributes: ['id', 'title', 'bodyHtml', 'bodyPreview', 'imageUrl', 'expiryAt', 'authorUserId', 'createdAt'],
        include: [{
          model: db.User,
          as: 'author',
          attributes: ['id', 'name', 'imageUrl'],
          required: false
        }]
      },
      {
        model: Course,
        as: 'course',
        attributes: ['id', 'title']
      },
      {
        model: AnnouncementRead,
        as: 'reads',
        required: false,
        where: { userId: student.id },
        attributes: ['id']
      }
    ],
    order: [
      ['isPinned', 'DESC'],
      ['attachedAt', 'DESC']
    ],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    distinct: true,
    subQuery: false
  });

  return {
    success: true,
    data: {
      announcements: rows.map(mapToItem),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / safeLimit))
      }
    }
  };
}

async function getUnreadCount(email, tenantId = null) {
  const student = await resolveStudent(email);
  if (!student) {
    return { success: false, error: 'Unknown student' };
  }

  const enrolledCourseIds = await getEnrolledCourseIds(student.id, tenantId);
  if (enrolledCourseIds.length === 0) {
    return { success: true, data: { count: 0 } };
  }

  const [row] = await db.sequelize.query(
    `SELECT COUNT(*)::int AS count
     FROM "announcementCourses" ac
     JOIN announcements a ON a.id = ac."announcementId"
     LEFT JOIN "announcementReads" ar
       ON ar."announcementCourseId" = ac.id AND ar."userId" = :userId
     WHERE ac."deletedAt" IS NULL
       AND a."deletedAt" IS NULL
       AND (a."expiryAt" IS NULL OR a."expiryAt" >= CURRENT_DATE)
       AND ac."courseId" IN (:courseIds)
       AND ar.id IS NULL`,
    {
      replacements: { userId: student.id, courseIds: enrolledCourseIds },
      type: QueryTypes.SELECT
    }
  );

  return { success: true, data: { count: row?.count || 0 } };
}

async function getForStudentById(email, announcementId, tenantId = null) {
  const { Announcement, AnnouncementCourse, AnnouncementRead, Course } = db;
  const student = await resolveStudent(email);
  if (!student) {
    return { success: false, error: 'Unknown student' };
  }

  const enrolledCourseIds = await getEnrolledCourseIds(student.id, tenantId);
  if (enrolledCourseIds.length === 0) {
    return { success: false, error: 'Announcement not found' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const row = await AnnouncementCourse.findOne({
    where: {
      announcementId,
      courseId: enrolledCourseIds
    },
    include: [
      {
        model: Announcement,
        as: 'announcement',
        required: true,
        where: {
          [Op.or]: [
            { expiryAt: null },
            { expiryAt: { [Op.gte]: today } }
          ]
        },
        include: [{
          model: db.User,
          as: 'author',
          attributes: ['id', 'name', 'imageUrl'],
          required: false
        }]
      },
      {
        model: Course,
        as: 'course',
        attributes: ['id', 'title']
      },
      {
        model: AnnouncementRead,
        as: 'reads',
        required: false,
        where: { userId: student.id },
        attributes: ['id']
      }
    ],
    order: [['attachedAt', 'DESC']]
  });

  if (!row) {
    return { success: false, error: 'Announcement not found' };
  }

  return {
    success: true,
    data: { announcement: mapToItem(row) }
  };
}

async function markRead(email, announcementCourseId, tenantId = null) {
  const student = await resolveStudent(email);
  if (!student) {
    return { success: false, error: 'Unknown student', status: 401 };
  }

  const row = await db.AnnouncementCourse.findByPk(announcementCourseId, {
    include: [{ model: db.Announcement, as: 'announcement' }]
  });
  if (!row) {
    return { success: false, error: 'Board not found', status: 404 };
  }

  const enrolledCourseIds = await getEnrolledCourseIds(student.id, tenantId);
  if (!enrolledCourseIds.includes(row.courseId)) {
    return { success: false, error: 'Not enrolled in this course', status: 403 };
  }

  if (!row.announcement) {
    return { success: false, error: 'Announcement no longer available', status: 410 };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (row.announcement.expiryAt && String(row.announcement.expiryAt).slice(0, 10) < today) {
    return { success: false, error: 'Announcement has expired', status: 410 };
  }

  await db.sequelize.query(
    `INSERT INTO "announcementReads" (id, "announcementCourseId", "userId", "readAt", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :announcementCourseId, :userId, NOW(), NOW(), NOW())
     ON CONFLICT ("announcementCourseId", "userId") DO NOTHING`,
    {
      replacements: { announcementCourseId: row.id, userId: student.id },
      type: QueryTypes.INSERT
    }
  );

  return { success: true };
}

module.exports = {
  listForStudent,
  getUnreadCount,
  getForStudentById,
  markRead
};
