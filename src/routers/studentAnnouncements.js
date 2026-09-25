'use strict';

/**
 * Student-facing announcement routes — mounted at /v1/announcements.
 *
 * IMPORTANT — route registration order matters in Express. The more-specific
 * paths (`/unread-count`, `/:id/read`) are registered before the catch-all
 * `/:id` so the latter doesn't swallow them.
 */

const express = require('express');
const service = require('../services/studentAnnouncements');
const { checkUserEmail } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * GET /v1/announcements/unread-count
 * Returns the navbar badge count. Registered BEFORE /:id so Express doesn't
 * mis-route the literal path "unread-count" as an :id.
 */
router.get('/unread-count', checkUserEmail, async (req, res) => {
  try {
    const result = await service.getUnreadCount(req.userEmail);
    if (!result.success) {
      return res.status(result.error === 'Unknown student' ? 401 : 400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /v1/announcements/:announcementCourseId/read
 * Mark a specific board's view of an announcement as read for the calling
 * student. Idempotent. Registered before /:id so the parser routes it here.
 */
router.post('/:announcementCourseId/read', checkUserEmail, async (req, res) => {
  try {
    const result = await service.markRead(req.userEmail, req.params.announcementCourseId);
    if (!result.success) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error
      });
    }
    // 204 No Content per the architecture — nothing useful to return.
    return res.status(204).end();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /v1/announcements
 * Paginated feed scoped to the student's enrolled courses.
 *
 * Query params:
 *   page       — integer, default 1
 *   limit      — integer, default 20, capped at 100
 *   course_id  — optional; filter to a single course (must be one the
 *                student is enrolled in, else returns empty)
 */
router.get('/', checkUserEmail, async (req, res) => {
  try {
    const { page, limit, course_id: courseId } = req.query;
    const result = await service.listForStudent(req.userEmail, { page, limit, courseId });
    if (!result.success) {
      return res.status(result.error === 'Unknown student' ? 401 : 400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /v1/announcements/:id
 * Single announcement fetch for the deep-link page. Includes body_html
 * (the list endpoint omits it; this is where the client lazy-loads it).
 *
 * Registered LAST so :id doesn't shadow /unread-count or /:id/read.
 */
router.get('/:id', checkUserEmail, async (req, res) => {
  try {
    const result = await service.getForStudentById(req.userEmail, req.params.id);
    if (!result.success) {
      const status =
        result.error === 'Unknown student' ? 401 :
        result.error === 'Announcement not found' ? 404 :
        400;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
