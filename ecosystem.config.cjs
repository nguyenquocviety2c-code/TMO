// PM2 ecosystem config for Theopusflashlite (TMO — Multi-Agent AI Platform)
//
// PM2 keeps the Next.js UI (the app's interface) alive and auto-restarts it
// if it ever crashes. The 3 supporting mini-services (openclaw-gateway,
// opencode-server, gateway-bridge) are spawned and supervised by the app's
// own internal `service-manager.ts`, so we intentionally do NOT also manage
// them here (that would double-spawn and fight over ports 18789/18790/18791).
//
// Qdrant (vector DB) IS managed here because it is needed by the Knowledge Base
// module (Database > Tài liệu) — without it the document list is always empty.
// Binary downloaded to /home/z/qdrant/qdrant (v1.19.0).
//
// Vosk ASR (port 3004) IS managed here — offline Vietnamese speech-to-text.
// Python mini-service at /home/z/tmo-app/mini-services/vosk-asr/index.py.
// Used by Live Mode (POST /api/voice/transcribe) before falling back to z-ai cloud.
//
// Neo4j (AuraDB cloud) is NOT managed here — it is a managed cloud service.
// Once AuraDB credentials are configured in .env, the app connects automatically.
//
// Usage:
//   pm2 start ecosystem.config.cjs        # launch Qdrant + UI together
//   pm2 status                             # see running processes
//   pm2 logs theopusflashlite              # tail the UI logs
//   pm2 logs qdrant                        # tail Qdrant logs
//   pm2 restart theopusflashlite           # restart the UI
//   pm2 restart qdrant                     # restart Qdrant
//   pm2 delete all                         # stop everything
//   pm2 save                               # persist process list
//
// The main app's stdout+stderr are written to /home/z/my-project/dev.log
// (appended via merge_logs, never truncated on restart) so the sandbox
// monitoring pipeline keeps working exactly as before.
module.exports = {
  apps: [
    {
      name: 'theopusflashlite',
      script: 'bun',
      args: 'run dev',
      cwd: '/home/z/tmo-app',
      env: {
        NODE_ENV: 'development',
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: '3000',
      },
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 4000,
      // Route both stdout + stderr into the single monitored dev.log,
      // appending (merge_logs) on every restart so history is preserved.
      out_file: '/home/z/my-project/dev.log',
      error_file: '/home/z/my-project/dev.log',
      merge_logs: true,
      log_date_format: '',
      time: false,
      kill_timeout: 8000,
    },
    {
      // Qdrant vector database — stores document chunks + 1536-dim embeddings.
      // Port: 6333 (REST) + 6334 (gRPC). Storage in /home/z/tmo-app/qdrant-storage.
      name: 'qdrant',
      script: '/home/z/qdrant/qdrant',
      args: '--config-path /home/z/tmo-app/qdrant-config.yaml',
      cwd: '/home/z/tmo-app',
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
    {
      // Vosk ASR — offline Vietnamese speech-to-text (port 3004).
      // Python mini-service using vosk-model-vn-0.4 (~70MB, loaded at startup).
      // Used by Live Mode: POST /api/voice/transcribe → /transcribe on 3004.
      // Falls back to z-ai cloud ASR if this is down.
      name: 'vosk-asr',
      script: 'python3',
      args: 'index.py',
      cwd: '/home/z/tmo-app/mini-services/vosk-asr',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      out_file: '/home/z/my-project/.zscripts/vosk.log',
      error_file: '/home/z/my-project/.zscripts/vosk.log',
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
