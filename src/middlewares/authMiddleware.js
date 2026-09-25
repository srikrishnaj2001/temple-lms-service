'use strict';

/**
 * Middleware to check if the request contains a user email in headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkUserEmail = (req, res, next) => {
  const userEmail = req.headers['user-email'];
  
  if (!userEmail) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed. User email is required in headers.'
    });
  }

  // Attach the email to the request for use in subsequent middleware or controllers
  req.userEmail = userEmail;
  next();
};

module.exports = {
  checkUserEmail
}; 