const http = require('http');
const cluster = require('cluster');
const os = require('os');
const app = require('./app');
const { sequelize } = require('../models');
const { startRagProcess, stopRagProcess } = require('./ragProcess');
const { startKeepAlive } = require('./keepAlive');
const { runMigrations } = require('./migrate');

const PORT = process.env.PORT || 8006;
const WORKERS = process.env.WEB_CONCURRENCY || Math.min(2, os.cpus().length);

/**
 * Bring the schema up to date before this deploy serves any traffic.
 *
 * Only one process per container does this — the cluster master in
 * production, or the single process in development. Forked workers skip it
 * because the master has already finished before it forks them.
 *
 * A failure here is fatal on purpose: serving requests against a schema the
 * code does not match breaks every route touching the changed table, which is
 * far worse than a failed deploy. Set AUTO_MIGRATE=0 to opt out and run
 * `npm run migrate` by hand instead.
 */
async function migrateIfPrimary() {
  if (!cluster.isMaster) return;
  if (process.env.AUTO_MIGRATE === '0') {
    console.log('[migrate] AUTO_MIGRATE=0 — skipping automatic migrations');
    return;
  }
  await runMigrations();
}

function abortOnMigrationFailure(err) {
  console.error('[migrate] FAILED — refusing to serve traffic against a stale schema');
  console.error(err);
  process.exit(1);
}

// lms-rag runs as a sibling process on this same container (proxied via
// /rag in app.js). Only the cluster master starts it — forked workers must
// not each spawn their own copy.
if (cluster.isMaster) {
  startRagProcess();
  startKeepAlive();
}

// Cluster for production scalability
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  console.log(`Master ${process.pid} is running`);

  // Workers are forked only once the schema is current, so no worker can
  // answer a request against a column its models expect but the DB lacks.
  migrateIfPrimary()
    .then(() => {
      console.log(`Starting ${WORKERS} workers...`);
      for (let i = 0; i < WORKERS; i++) {
        cluster.fork();
      }
    })
    .catch(abortOnMigrationFailure);

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    console.log('Starting a new worker...');
    cluster.fork();
  });

  // Graceful shutdown for master
  const shutdownMaster = () => {
    console.log('Master shutting down...');
    stopRagProcess();
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdownMaster);
  process.on('SIGTERM', shutdownMaster);

} else {
  // Catch unhandled promise rejections — prevents mystery crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
  });

  // Catch uncaught exceptions — log and let the process manager restart
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
    process.exit(1);
  });

  // Worker process
  const server = http.createServer(app);

  // Server configuration for high concurrency
  server.keepAliveTimeout = 65000; // Slightly higher than ALB timeout
  server.headersTimeout = 66000;   // Higher than keepAliveTimeout
  server.timeout = 120000;         // 2 minutes
  server.maxHeadersCount = 1000;   // Prevent header overflow attacks

  // In production this is a forked worker and migrateIfPrimary() is a no-op
  // (the master already migrated). In development this is the only process,
  // so it migrates before binding the port.
  migrateIfPrimary().then(startListening).catch(abortOnMigrationFailure);

  function startListening() {
    server.listen(PORT, async () => {
      const workerId = cluster.worker ? cluster.worker.id : 'single';
      console.log(`🚀 Worker ${workerId} (PID: ${process.pid}) listening on port ${PORT}`);

      try {
        // Test database connection but don't sync in production
        await sequelize.authenticate();
        console.log(`Worker ${workerId}: Database connection established`);

        // Only sync in development
        if (process.env.NODE_ENV !== 'production') {
          await sequelize.sync({ alter: false });
          console.log(`Worker ${workerId}: Database synced`);
        }
      } catch (err) {
        console.error(`Worker ${workerId}: Database connection failed:`, err);
        process.exit(1);
      }
    });
  }

  // Enhanced error handling
  server.on('error', (err) => {
    console.error('Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
      process.exit(1);
    }
  });

  server.on('clientError', (err, socket) => {
    console.error('Client error:', err);
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  // Graceful shutdown for worker
  const shutdown = async (signal) => {
    const workerId = cluster.worker ? cluster.worker.id : 'single';
    console.log(`Worker ${workerId} received ${signal}, shutting down gracefully...`);
    if (cluster.isMaster) stopRagProcess();

    server.close(async () => {
      console.log(`Worker ${workerId}: HTTP server closed`);
      
      try {
        await sequelize.close();
        console.log(`Worker ${workerId}: Database connections closed`);
        process.exit(0);
      } catch (err) {
        console.error(`Worker ${workerId}: Error during shutdown:`, err);
        process.exit(1);
      }
    });

    // Force close after 30 seconds
    setTimeout(() => {
      console.error(`Worker ${workerId}: Forced shutdown after timeout`);
      process.exit(1);
    }, 30000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
