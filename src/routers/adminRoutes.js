const express = require('express');
const adminService = require('../services/admin');

const apiRouter = express.Router();
const libraryAssets = require('../services/libraryAssets');
apiRouter.post('/lesson-summary', async (req, res) => {
  // The legacy CMS has no server-side admin session yet. Keep paid generation local-only.
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (process.env.NODE_ENV === 'production' || !local || req.headers['x-forwarded-for'] || req.headers.forwarded) {
    return res.status(403).json({ success: false, error: 'Summary generation is available only in local development until admin authentication is configured.' });
  }
  try {
    const { source, title } = req.body;
    if (typeof source !== 'string' || source.trim().length < 50 || source.length > 100000) return res.status(400).json({ success: false, error: 'Provide between 50 and 100,000 characters of lesson text or transcript.' });
    const summary = await require('../services/summaryService').generateSummaryFromText(source, String(title || '').slice(0, 255));
    res.json({ success: true, data: { summary: require('../utils/sanitizeHtml').sanitize(summary) } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

for (const collection of ['audios', 'reads']) {
  apiRouter.get(`/${collection}`, async (req, res) => {
    try { res.json(await libraryAssets.list(collection, req.query)); }
    catch (error) { res.status(400).json({ success: false, error: error.message }); }
  });
  apiRouter.post(`/${collection}`, async (req, res) => {
    try { res.status(201).json(await libraryAssets.save(collection, null, req.body)); }
    catch (error) { res.status(400).json({ success: false, error: error.message }); }
  });
  apiRouter.put(`/${collection}/:id`, async (req, res) => {
    try { res.json(await libraryAssets.save(collection, req.params.id, req.body)); }
    catch (error) { res.status(400).json({ success: false, error: error.message }); }
  });
  apiRouter.delete(`/${collection}/:id`, async (req, res) => {
    try { res.json(await libraryAssets.remove(collection, req.params.id)); }
    catch (error) { res.status(400).json({ success: false, error: error.message }); }
  });
}

// ==================== TOP-LEVEL COURSE ENDPOINTS ====================

apiRouter.get('/top-courses', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getAllTopLevelCourses(page, limit);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/top-courses/:id', async (req, res) => {
  try {
    const result = await adminService.getTopLevelCourseById(parseInt(req.params.id));
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/top-courses', async (req, res) => {
  try {
    const result = await adminService.createTopLevelCourse(req.body);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.put('/top-courses/:id', async (req, res) => {
  try {
    const result = await adminService.updateTopLevelCourse(parseInt(req.params.id), req.body);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.delete('/top-courses/:id', async (req, res) => {
  try {
    const result = await adminService.deleteTopLevelCourse(parseInt(req.params.id));
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/top-courses/:id/can-delete', async (req, res) => {
  try {
    const result = await adminService.canDeleteTopLevelCourse(parseInt(req.params.id));
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== COHORT ENDPOINTS (legacy: /courses) ====================

// Get all courses
apiRouter.get('/courses', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await adminService.getAllCourses(page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get course by ID
apiRouter.get('/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getCourseById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create course
apiRouter.post('/courses', async (req, res) => {
  try {
    const result = await adminService.createCourse(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update course
apiRouter.put('/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateCourse(parseInt(id), req.body);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete course
apiRouter.delete('/courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteCourse(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Check if course can be deleted
apiRouter.get('/courses/:id/can-delete', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.canDeleteCourse(parseInt(id));
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get all distinct course managers / instructors
apiRouter.get('/managers', async (req, res) => {
  try {
    const { User } = require('../../models');
    const rows = await User.findAll({
      attributes: ['id', 'name', 'email', 'imageUrl'],
      order: [['name', 'ASC']]
    });
    res.status(200).json({
      success: true,
      data: {
        managers: rows.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          image_url: user.imageUrl || null,
          role: 'admin'
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get community links by course
apiRouter.get('/courses/:courseId/community-links', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await adminService.getCommunityLinksByCourse(parseInt(courseId));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create community link for course
apiRouter.post('/courses/:courseId/community-links', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await adminService.createCommunityLink(parseInt(courseId), req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update community link for course
apiRouter.put('/courses/:courseId/community-links/:linkId', async (req, res) => {
  try {
    const { courseId, linkId } = req.params;
    const result = await adminService.updateCommunityLink(parseInt(courseId), parseInt(linkId), req.body);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete community link for course
apiRouter.delete('/courses/:courseId/community-links/:linkId', async (req, res) => {
  try {
    const { courseId, linkId } = req.params;
    const result = await adminService.deleteCommunityLink(parseInt(courseId), parseInt(linkId));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get all reusable tools
apiRouter.get('/tools', async (req, res) => {
  try {
    const result = await adminService.getAllTools();
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create reusable tool
apiRouter.post('/tools', async (req, res) => {
  try {
    const result = await adminService.createTool(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get tools attached to a course
apiRouter.get('/courses/:courseId/tools', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await adminService.getCohortTools(parseInt(courseId));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Replace tools attached to a course
apiRouter.put('/courses/:courseId/tools', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await adminService.setCohortTools(parseInt(courseId), req.body.toolIds || []);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== FORM ENDPOINTS ====================

// Get all forms
apiRouter.get('/forms', async (req, res) => {
  try {
    const { page = 1, limit = 50, courseId } = req.query;
    const result = await adminService.getAllForms(page, limit, courseId ? parseInt(courseId) : null);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get forms attached to a course
apiRouter.get('/courses/:courseId/forms', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getFormsByCourse(parseInt(courseId), page, limit);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get form by ID
apiRouter.get('/forms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getFormById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create form
apiRouter.post('/forms', async (req, res) => {
  try {
    const result = await adminService.createForm(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update form
apiRouter.put('/forms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateForm(parseInt(id), req.body);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete form
apiRouter.delete('/forms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteForm(parseInt(id));
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== MODULE ENDPOINTS ====================

// Get all modules
apiRouter.get('/modules', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getAllModules(page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get module by ID
apiRouter.get('/modules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getModuleById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get modules by course
apiRouter.get('/courses/:courseId/modules', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getModulesByCourse(parseInt(courseId), page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create module
apiRouter.post('/modules', async (req, res) => {
  try {
    const result = await adminService.createModule(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Copy module and its contents into another course
apiRouter.post('/modules/:id/copy', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.copyModule(parseInt(id), req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update module
apiRouter.put('/modules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateModule(parseInt(id), req.body);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete module
apiRouter.delete('/modules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteModule(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Check if module can be deleted
apiRouter.get('/modules/:id/can-delete', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.canDeleteModule(parseInt(id));
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== VIDEO ENDPOINTS ====================

// Get all videos
apiRouter.get('/videos', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getAllVideos(page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Search videos by title
apiRouter.get('/videos/search', async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    const { Video } = require('../../models');
    const { Op } = require('sequelize');
    const rows = await Video.findAll({
      where: q ? { title: { [Op.iLike]: `%${q}%` } } : {},
      limit: parseInt(limit),
      order: [['title', 'ASC']]
    });
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get videos already linked to a module
apiRouter.get('/videos/module/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { Content, Video } = require('../../models');
    const contents = await Content.findAll({
      where: { moduleId: parseInt(moduleId), contentType: 'VIDEO' },
      order: [['sequenceNumber', 'ASC']]
    });
    const videos = await Video.findAll({
      where: { id: contents.map((content) => content.contentId) }
    });
    res.status(200).json({ success: true, data: videos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get video by ID
apiRouter.get('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getVideoById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create video
apiRouter.post('/videos', async (req, res) => {
  try {
    const result = await adminService.createVideo(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update video
apiRouter.put('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateVideo(parseInt(id), req.body);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete video
apiRouter.delete('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteVideo(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== RESOURCE ENDPOINTS ====================

// Search resources by title
apiRouter.get('/resources/search', async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    const { Resource } = require('../../models');
    const { Op } = require('sequelize');
    const rows = await Resource.findAll({
      where: q ? { title: { [Op.iLike]: `%${q}%` } } : {},
      limit: parseInt(limit),
      order: [['title', 'ASC']]
    });
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search assignments by title
apiRouter.get('/assignments/search', async (req, res) => {
  try {
    res.status(200).json({ success: true, data: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get resources already linked to a module
apiRouter.get('/resources/module/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { Content, Resource } = require('../../models');
    const contents = await Content.findAll({
      where: { moduleId: parseInt(moduleId), contentType: 'RESOURCE' },
      order: [['sequenceNumber', 'ASC']]
    });
    const resources = await Resource.findAll({
      where: { id: contents.map((content) => content.contentId) }
    });
    res.status(200).json({ success: true, data: resources });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all resources
apiRouter.get('/resources', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getAllResources(page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get resource by ID
apiRouter.get('/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getResourceById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create resource
apiRouter.post('/resources', async (req, res) => {
  try {
    const result = await adminService.createResource(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update resource
apiRouter.put('/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateResource(parseInt(id), req.body);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete resource
apiRouter.delete('/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteResource(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== CONTENT ENDPOINTS ====================

// Get all contents
apiRouter.get('/contents', async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const result = await adminService.getAllContents(page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get content by ID
apiRouter.get('/contents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getContentById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get contents by module
apiRouter.get('/modules/:moduleId/contents', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getContentsByModule(parseInt(moduleId), page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create content
apiRouter.post('/contents', async (req, res) => {
  try {
    const result = await adminService.createContent(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Copy selected contents into another module
apiRouter.post('/contents/copy', async (req, res) => {
  try {
    const result = await adminService.copyContents(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update content
apiRouter.put('/contents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateContent(parseInt(id), req.body);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete content
apiRouter.delete('/contents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteContent(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== USER ENDPOINTS ====================

// Get all users
apiRouter.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getAllUsers(page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Search users
apiRouter.get('/users/search', async (req, res) => {
  try {
    const result = await adminService.searchUsers(req.query);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get user by ID
apiRouter.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getUserById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create user
apiRouter.post('/users', async (req, res) => {
  try {
    const result = await adminService.createUser(req.body);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Update user
apiRouter.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateUser(parseInt(id), req.body);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete user
apiRouter.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteUser(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== ENROLLMENT ENDPOINTS ====================

// Get all enrollments
apiRouter.get('/enrollments', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getAllEnrollments(page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get enrollment by ID
apiRouter.get('/enrollments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getEnrollmentById(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get enrollment detail with module progress and form responses
apiRouter.get('/enrollments/:id/detail', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.getEnrollmentDetail(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Get enrollments by course
apiRouter.get('/courses/:courseId/enrollments', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.getEnrollmentsByCourse(parseInt(courseId), page, limit);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Create enrollment with user logic
apiRouter.post('/enrollments', async (req, res) => {
  try {
    const result = await adminService.createEnrollment(req.body);
    const statusCode = result.success ? 201 : (result.error === 'Duplicate enrollment' ? 409 : 400);
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Bulk create enrollments with user logic
apiRouter.post('/courses/:courseId/enrollments/bulk', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { users } = req.body;
    
    const result = await adminService.bulkCreateEnrollments({
      users,
      cohort_id: parseInt(courseId)
    });
    
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// Delete enrollment
apiRouter.delete('/enrollments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteEnrollment(parseInt(id));
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
});

// ==================== ASSIGNMENT ENDPOINTS ====================

// Get all assignments (for video attachment picker)
apiRouter.get('/assignments', async (req, res) => {
  try {
    const { page = 1, limit = 200 } = req.query;
    res.status(200).json({
      success: true,
      data: {
        assignments: [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VIDEO ATTACHMENT ENDPOINTS ====================

// Get attachments for a video
apiRouter.get('/videos/:videoId/attachments', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { VideoAttachment, Resource, Assignment } = require('../../models');

    const attachments = await VideoAttachment.findAll({
      where: { video_id: parseInt(videoId) },
      order: [['content_type', 'ASC'], ['sequence_number', 'ASC']]
    });

    // Resolve the actual resource/assignment data
    const resolved = [];
    for (const att of attachments) {
      let data = null;
      if (att.content_type === 'RESOURCE') {
        data = await Resource.findByPk(att.content_id);
      } else if (att.content_type === 'ASSIGNMENT') {
        data = await Assignment.findByPk(att.content_id);
      }
      resolved.push({
        id: att.id,
        video_id: att.video_id,
        content_type: att.content_type,
        content_id: att.content_id,
        sequence_number: att.sequence_number,
        title: data?.title || null,
        description: data?.description || null,
        url: data?.url || null,
        resource_type: att.content_type === 'RESOURCE' ? data?.type || null : null,
        created_at: att.created_at,
        updated_at: att.updated_at
      });
    }

    res.status(200).json({ success: true, data: { attachments: resolved } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a video attachment
apiRouter.post('/videos/:videoId/attachments', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { content_type, content_id, sequence_number } = req.body;
    const { VideoAttachment, Video, Resource, Assignment } = require('../../models');

    // Validate video exists
    const video = await Video.findByPk(parseInt(videoId));
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    // Validate the referenced resource/assignment exists
    if (content_type === 'RESOURCE') {
      const resource = await Resource.findByPk(content_id);
      if (!resource) return res.status(400).json({ success: false, error: 'Resource not found' });
    } else if (content_type === 'ASSIGNMENT') {
      const assignment = await Assignment.findByPk(content_id);
      if (!assignment) return res.status(400).json({ success: false, error: 'Assignment not found' });
    } else {
      return res.status(400).json({ success: false, error: 'content_type must be RESOURCE or ASSIGNMENT' });
    }

    const attachment = await VideoAttachment.create({
      video_id: parseInt(videoId),
      content_type,
      content_id,
      sequence_number: sequence_number || 1
    });

    res.status(201).json({ success: true, data: attachment });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, error: 'This attachment already exists for this video' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a video attachment
apiRouter.put('/video-attachments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { sequence_number } = req.body;
    const { VideoAttachment } = require('../../models');

    const attachment = await VideoAttachment.findByPk(parseInt(id));
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    await attachment.update({ sequence_number });
    res.status(200).json({ success: true, data: attachment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a video attachment
apiRouter.delete('/video-attachments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { VideoAttachment } = require('../../models');

    const attachment = await VideoAttachment.findByPk(parseInt(id));
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    await attachment.destroy();
    res.status(200).json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all videos with their attachment counts (for admin listing)
apiRouter.get('/video-attachments/summary', async (req, res) => {
  try {
    const { Video, VideoAttachment } = require('../../models');
    const { sequelize } = require('../../models');

    const videos = await Video.findAll({
      attributes: [
        'id', 'title',
        [sequelize.fn('COUNT', sequelize.col('attachments.id')), 'attachment_count']
      ],
      include: [{
        model: VideoAttachment,
        as: 'attachments',
        attributes: []
      }],
      group: ['Video.id'],
      order: [['id', 'ASC']]
    });

    res.status(200).json({ success: true, data: { videos } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = apiRouter;
