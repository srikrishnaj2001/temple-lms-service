const express = require('express');
const { User } = require('../../models');
const { checkUserEmail } = require('../middlewares/authMiddleware');

const meRouter = express.Router();

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName || user.name,
    email: user.email,
    phone: user.phone,
    imageUrl: user.imageUrl,
  };
}

meRouter.get('/', checkUserEmail, async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: User.normalizeEmail(req.userEmail) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

meRouter.patch('/', checkUserEmail, async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: User.normalizeEmail(req.userEmail) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { displayName } = req.body || {};
    if (typeof displayName === 'string') {
      const trimmed = displayName.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'displayName cannot be empty' });
      }
      user.displayName = trimmed;
      await user.save();
    }

    res.status(200).json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = meRouter;
