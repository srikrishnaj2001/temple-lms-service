require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { sequelize } = require('../models');
const coursesRouter = require('./routers/courses');

const app = express();

// Security middleware - Relaxed CSP for AdminJS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Allow CORS for AdminJS routes (same-origin requests from admin panel)
app.use('/admin', cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// CORS - allow configured app origins, and stay permissive in local development.
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Also check explicit list from env
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // For development, be more permissive
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'user-email',
    'x-request-url',
    'ngrok-skip-browser-warning',  // ← ADD THIS LINE
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Compression with better settings
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));

// Body parsing with security limits
app.use(express.json({ 
  limit: '1mb', // Reduced from 10mb for security
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '1mb',
  parameterLimit: 100
}));

// Rate limiting — keyed by user-email header when present, falls back to IP.
// This prevents all server-side requests (from the co-hosted Next.js app)
// from sharing a single IP-based bucket.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // per user (identified by email or IP)
  message: {
    error: 'Our servers are currently experiencing high traffic. Please retry accessing the LMS in 15 minutes.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user-email header as the key when available so each user
    // gets their own bucket instead of all server-side requests
    // sharing a single IP-based bucket.
    return req.headers['user-email'] || ipKeyGenerator(req.ip);
  },
  skip: (req) => {
    // Skip rate limiting for health checks and admin panel assets
    return req.path === '/health' || req.path.startsWith('/admin');
  },
});

app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check with detailed info
app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  };

  try {
    const startTime = Date.now();
    await sequelize.authenticate();
    const dbResponseTime = Date.now() - startTime;
    
    healthCheck.database = {
      status: 'Connected',
      responseTime: `${dbResponseTime}ms`
    };
    
    res.status(200).json(healthCheck);
  } catch (err) {
    console.error('Health check database error:', err);
    healthCheck.status = 'Error';
    healthCheck.database = {
      status: 'Disconnected',
      error: err.message
    };
    res.status(503).json(healthCheck);
  }
});

app.use('/v1/courses', coursesRouter);

const studentAnnouncementsRouter = require('./routers/studentAnnouncements');
app.use('/v1/announcements', studentAnnouncementsRouter);

const onboardingRouter = require('./routers/onboarding');
app.use('/v1/onboarding', onboardingRouter);

const tenantsRouter = require('./routers/tenants');
const adminAuth = require('./routers/adminAuth');
app.use('/api/auth', adminAuth.router);
app.use('/api', adminAuth.requireAdmin);
app.use('/api', require('./routers/cms'));
app.use('/api/tenants', tenantsRouter);

const adminRouter = require('./routers/adminRoutes');
app.use('/api', adminRouter);

const announcementsRouter = require('./routers/announcements');
app.use('/api/announcements', announcementsRouter);

const uploadsRouter = require('./routers/uploads');
app.use('/api/uploads', uploadsRouter);

// 404 handler - Fixed for Express v5 compatibility
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error with context
  console.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    ...(isDevelopment && { 
      message: err.message,
      stack: err.stack 
    }),
    timestamp: new Date().toISOString(),
    requestId: req.id || 'unknown'
  });
});

module.exports = app;
