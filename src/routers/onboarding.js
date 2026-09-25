'use strict';

const express = require('express');
const { checkUserEmail } = require('../middlewares/authMiddleware');
const onboardingService = require('../services/onboarding');

const router = express.Router();

router.get('/status', checkUserEmail, async (req, res) => {
  try {
    const data = await onboardingService.getStatus(req.userEmail);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/roles', checkUserEmail, async (req, res) => {
  try {
    const data = await onboardingService.listRoles();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/complete', checkUserEmail, async (req, res) => {
  try {
    const data = await onboardingService.completeOnboarding(req.userEmail, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/skip', checkUserEmail, async (req, res) => {
  try {
    const data = await onboardingService.skipOnboarding(req.userEmail, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
