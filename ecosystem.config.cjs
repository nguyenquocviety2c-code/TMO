// PM2 ecosystem config for Theopusflashlite (Multi-Agent AI Platform)
//
// PM2 keeps the Next.js UI (the app's interface) alive and auto-restarts it
// if it ever crashes. The 3 supporting mini-services (openclaw-gateway,
// opencode-server, gateway-bridge) are spawned and supervised by the app's
// own internal `service-manager.ts`, so we intentionally do NOT also manage
// them here (that would double-spawn and fight over ports 18789/18790/18791).
//
// We DO manage Qdrant here because it is an external data service (port 6333)
// — it is not spawned by the app, so it needs its own PM2 entry to survive
// restarts and stay alive.
//
// Usage:
//   pm2 start ecosystem.config.cjs     # launch
//   pm2 status                          # see running processes
//   pm2 logs theopusflashlite            # tail the UI logs
//   pm2 logs qdrant                      # tail Qdrant logs
//   pm2 restart theopusflashlite         # restart the UI
//   pm2 delete all                       # stop everything
//
// The main app's stdout+stderr are written to /home/z/my-project/dev.log
// (appended, never truncated) so the sandbox monitoring pipeline keeps
// working exactly as before.
module.exports = {
  apps: [
    {
      name: 'theopusflashlite',
      script: 'bun',
      args: 'run dev',
      cwd: '/home/z/my-project',
      env: {
        NODE_ENV: 'development',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 4000,
      // Route both stdout + stderr into the single monitored dev.log,
      // appending (not truncating) on every restart so history is preserved.
      out_file: '/home/z/my-project/dev.log',
      error_file: '/home/z/my-project/dev.log',
      merge_logs: true,
      log_date_format: '',
      time: false,
      kill_timeout: 8000,
    },
    {
      // Qdrant vector database — stores document chunks + 1536-dim embeddings.
      // Port: 6333 (REST) + 6334 (gRPC). Storage in ./qdrant-storage (project-local).
      name: 'qdrant',
      script: '/home/z/qdrant/qdrant',
      args: '--config-path /home/z/my-project/qdrant-config.yaml',
      cwd: '/home/z/my-project',
      env: {
        RUST_LOG: 'info',
      },
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      out_file: '/home/z/my-project/.zscripts/qdrant.log',
      error_file: '/home/z/my-project/.zscripts/qdrant.log',
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
