const express = require('express');
const formService = require('../services/forms');
const { checkUserEmail } = require('../middlewares/authMiddleware');

const router = express.Router();

// ==================== USER ENDPOINTS (Protected by auth) ====================

// Submit form responses
router.post('/enrollments/:enrollmentId/responses', checkUserEmail, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { responses } = req.body;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'responses array is required'
      });
    }

    const result = await formService.submitFormResponses(
      parseInt(enrollmentId),
      responses,
      req.userEmail
    );
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

module.exports = router;
