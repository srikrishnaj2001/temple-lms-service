'use strict';

/**
 * Announcement routes — mounted at /api/announcements (see src/app.js).
 *
 * v1 exposes only POST. List / get / update / delete / pin endpoints land
 * in later phases (see ANNOUNCEMENT_BOARD_CHECKLIST.md).
 */

const express = require('express');
const announcementService = require('../services/announcements');
const { checkUserEmail } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * POST /api/announcements
 * Create a new announcement and attach it to one or more course boards.
 *
 * Auth: requires the `user-email` header (checkUserEmail middleware).
 *       The email is forwarded to the service for author resolution.
 *
 * Status codes:
 *   201 — created
 *   400 — validation error (returned as { success: false, error })
 *   500 — unexpected server error
 */
router.post('/', checkUserEmail, async (req, res) => {
  try {
    const result = await announcementService.createAnnouncement(req.body, req.userEmail);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/announcements
 * Paginated list of announcements for the admin view.
 *
 * Query params:
 *   page       — integer, default 1
 *   limit      — integer, default 20, capped at 100
 *   status     — 'active' | 'expired' | 'all' (default 'all')
 *   course_id  — restrict to announcements attached to a specific course board
 */
router.get('/', checkUserEmail, async (req, res) => {
  try {
    const { page, limit, status, course_id: courseId } = req.query;
    const result = await announcementService.listAnnouncements({ page, limit, status, courseId });
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
 * GET /api/announcements/:id
 * Fetch a single announcement (with body_html and full board list) — used by
 * the admin's edit modal to prefill the form.
 */
router.get('/:id', checkUserEmail, async (req, res) => {
  try {
    const result = await announcementService.getAnnouncementById(req.params.id);
    if (!result.success) {
      const status = result.error === 'Announcement not found' ? 404 : 400;
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

/**
 * PATCH /api/announcements/:id
 * Update an existing announcement: content fields (title/body/expiry) and
 * the course attachment set. Same payload shape as POST /. Returns the
 * updated announcement in the same shape as GET /:id.
 */
router.patch('/:id', checkUserEmail, async (req, res) => {
  try {
    const result = await announcementService.updateAnnouncement(req.params.id, req.body);
    if (!result.success) {
      const status = result.error === 'Announcement not found' ? 404 : 400;
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

/**
 * DELETE /api/announcements/:id
 * Soft-delete the announcement. The row is retained (paranoid mode) so
 * future comment/like features can still reference it, but it disappears
 * from all student-facing queries immediately.
 */
router.delete('/:id', checkUserEmail, async (req, res) => {
  try {
    const result = await announcementService.deleteAnnouncement(req.params.id);
    if (!result.success) {
      const status = result.error === 'Announcement not found' ? 404 : 400;
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

/**
 * GET /api/announcements/:id/pin-context
 * Returns the data needed to render the pin modal: one row per board the
 * announcement is attached to, with current pin state + per-course total
 * pinned count (for showing the X/5 hint and disabling at-cap boards).
 */
router.get('/:id/pin-context', checkUserEmail, async (req, res) => {
  try {
    const result = await announcementService.getPinContext(req.params.id);
    if (!result.success) {
      // Treat missing announcement as 404, everything else as 400.
      const status = result.error === 'Announcement not found' ? 404 : 400;
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

/**
 * PATCH /api/announcements/:id/pins
 * Batch update pin state across all of this announcement's boards.
 *
 * Body: { pinned_course_ids: number[] }
 *   - Courses in the array are pinned.
 *   - Courses the announcement is attached to but NOT in the array are unpinned.
 *   - The whole change is transactional.
 *
 * 5-per-course pin cap is enforced inside the service; violation returns 400.
 * Returns the updated pin context on success.
 */
router.patch('/:id/pins', checkUserEmail, async (req, res) => {
  try {
    const { pinned_course_ids: pinnedCourseIds } = req.body || {};
    const result = await announcementService.updatePins(req.params.id, pinnedCourseIds);
    if (!result.success) {
      const status = result.error === 'Announcement not found' ? 404 : 400;
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
