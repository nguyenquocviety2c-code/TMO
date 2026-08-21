module.exports = {
  apps: [
    {
      name: 'theopusflashlite',
      script: 'bun',
      args: 'run dev',
      cwd: '/home/z/my-project/Theopusflashlite',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      // Restart settings
      max_restarts: 10,
      restart_delay: 5000,
      autorestart: true,
      watch: false,
      // Memory limit — restart if exceeding 2GB
      max_memory_restart: '2G',
      // Log settings
      error_file: '/home/z/.pm2/logs/theopusflashlite-error.log',
      out_file: '/home/z/.pm2/logs/theopusflashlite-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
