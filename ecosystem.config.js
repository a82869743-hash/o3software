/**
 * ecosystem.config.js — Hostinger VPS PM2 Production Cluster Configuration
 * Designed for O3 Car Spaa multi-tenant detailing studio platform.
 */

module.exports = {
  apps: [
    {
      name: 'o3-car-spaa-api',
      script: './server/src/app.js',
      cwd: __dirname,

      // Cluster Mode Execution (Utilizes multiple CPU cores on Hostinger VPS)
      instances: 'max',
      exec_mode: 'cluster',

      // Auto-restart & Memory Safeguards (1GB cap per worker to fit VPS RAM profile)
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,

      // Graceful Reload with Zero Downtime (SIGINT handled cleanly)
      kill_timeout: 5000,
      listen_timeout: 8000,
      wait_ready: false,

      // Logging & Observability
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      output: './logs/pm2-out.log',
      error: './logs/pm2-error.log',

      // Environment Profile Targets
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5001
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000
      }
    }
  ]
};
