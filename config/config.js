require('dotenv').config();

// Mask sensitive connection details for logging
const databaseUrl = process.env.DATABASE_URL;
const maskedUrl = databaseUrl ? databaseUrl.replace(/\/\/(.+):(.+)@/, '//****:****@') : 'Not configured';
console.log(`Using database connection: ${maskedUrl}`);

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: console.log,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    },
    retry: {
      match: [
        /ConnectionError/,
        /ConnectionRefusedError/,
        /ConnectionTimedOutError/,
        /TimeoutError/,
      ],
      max: 3
    }
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 100,        // Maximum connections in pool
      min: 10,         // Minimum connections in pool
      acquire: 60000,  // Maximum time to get connection (ms)
      idle: 30000,     // Maximum idle time before releasing (ms)
      evict: 1000,     // How often to check for idle connections (ms)
      handleDisconnects: true
    },
    retry: {
      match: [
        /ConnectionError/,
        /ConnectionRefusedError/,
        /ConnectionTimedOutError/,
        /TimeoutError/,
        /SequelizeConnectionError/
      ],
      max: 5
    },
    dialectOptions: {
      ssl: { rejectUnauthorized: false },
      keepAlive: true,
      statement_timeout: 60000,
      query_timeout: 60000,
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 30000
    },
    benchmark: true,
    logQueryParameters: false
  },
};
