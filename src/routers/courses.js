const express = require('express');
const coursesService = require('../services/courses');
const { checkUserEmail } = require('../middlewares/authMiddleware');

const coursesRouter = express.Router();

coursesRouter.get('/enrollments',checkUserEmail, async(req, res) => {
  try {
    //const {page, limit} = req.query;
    const enrolledCourses = await coursesService.getEnrolledCourses(req.userEmail);
    res.status(200).json({
      enrolledCourses
    }); 
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

coursesRouter.get('/catalog', checkUserEmail, async(req, res) => {
  try {
    const courses = await coursesService.getCatalogCourses();
    res.status(200).json({
      courses
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

coursesRouter.get('/dashboard-course',checkUserEmail, async(req, res) => {
  try {
    const { courseId } = req.query;

    // If courseId is provided, fetch that specific course; otherwise get the most recent
    const dashboardCourse = courseId
      ? await coursesService.getDashboardCourseByCourseId(parseInt(courseId), req.userEmail)
      : await coursesService.getDashboardCourse(req.userEmail);

    res.status(200).json({
      data: dashboardCourse
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

coursesRouter.get('/:courseId/library',checkUserEmail, async(req, res) => {
  try {
    const { courseId } = req.params;
    
    const courseLibrary = await coursesService.getCourseLibrary(parseInt(courseId), req.userEmail);
    res.status(200).json({
      data: courseLibrary
    });
  } catch (error) {
    if (error.message === 'User is not enrolled in this course') {
      res.status(403).json({
        error: error.message
      });
    } else if (error.message === 'Course not found') {
      res.status(404).json({
        error: error.message
      });
  } else {
      res.status(500).json({
        error: error.message
      });
    }
  }
});

// Get video stream data by content ID
coursesRouter.get('/content/:contentId/audio-stream', checkUserEmail, async (req, res) => {
  const result = await coursesService.getAudioStreamByContentId(parseInt(req.params.contentId, 10), req.userEmail);
  res.status(result.success ? 200 : 400).json(result);
});

coursesRouter.get('/content/:contentId/video-stream', checkUserEmail, async(req, res) => {
  try {
    const { contentId } = req.params;
    
    const videoStream = await coursesService.getVideoStreamByContentId(parseInt(contentId), req.userEmail);
    
    if (videoStream.success) {
      res.status(200).json(videoStream);
    } else {
      res.status(400).json(videoStream);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: {
        contentId: req.params.contentId,
        error: 'Internal server error'
      }
    });
  }
});

// Update progress for a content item (video watch duration + status)
coursesRouter.post('/content/:contentId/progress', checkUserEmail, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { watchedDuration, status } = req.body;

    const validStatuses = ['IN_PROGRESS', 'COMPLETED'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    await coursesService.updateContentProgress(req.userEmail, parseInt(contentId), { watchedDuration, status });

    res.status(200).json({ success: true });
  } catch (error) {
    if (error.message === 'User not found' || error.message === 'Content not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('not enrolled')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = coursesRouter;
