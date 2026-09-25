// PM2 Configuration for Production Deployment
module.exports = {
  apps: [{
    name: 'clug-service',
    script: 'src/server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 8006
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8006
    },
    // Performance monitoring
    monitoring: false,
    pmx: false,
    
    // Logging
    log_file: './logs/app.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto restart configuration
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Health monitoring
    min_uptime: '10s',
    max_restarts: 10,
    
    // Advanced features
    merge_logs: true,
    time: true
  }]
};
