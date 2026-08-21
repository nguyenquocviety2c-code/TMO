#!/usr/bin/env python3
"""
Vosk Vietnamese ASR Mini-Service
Port: 3004

POST /transcribe
  Body: { "audio_base64": "base64-encoded WAV audio" }
  Returns: { "text": "transcribed Vietnamese text", "success": true }

The audio can be any format (webm, mp3, wav) — we use ffmpeg to convert
to 16kHz mono WAV which Vosk requires.

Vietnamese model: vosk-model-vn-0.4 (~40MB)
Location: /home/z/vosk-models/vosk-model-vn-0.4
"""

import json
import base64
import tempfile
import os
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

# Vosk imports
from vosk import Model, KaldiRecognizer

# ==================== CONFIG ====================

PORT = 3004
MODEL_PATH = "/home/z/vosk-models/vosk-model-vn-0.4"
SAMPLE_RATE = 16000  # Vosk requires 16kHz

# ==================== LOAD MODEL (singleton) ====================

print(f"[Vosk] Loading Vietnamese model from {MODEL_PATH}...")
model = Model(MODEL_PATH)
print(f"[Vosk] Model loaded successfully!")
print(f"[Vosk] Server starting on port {PORT}...")

# ==================== AUDIO CONVERSION ====================

def convert_to_wav(input_path: str, output_path: str) -> bool:
    """Convert any audio format to 16kHz mono WAV using ffmpeg."""
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ar", str(SAMPLE_RATE),  # 16kHz
                "-ac", "1",                # mono
                "-f", "wav",               # WAV format
                output_path
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"[Vosk] ffmpeg error: {e.stderr.decode()[:200]}")
        return False
    except subprocess.TimeoutExpired:
        print("[Vosk] ffmpeg timeout")
        return False

# ==================== TRANSCRIPTION ====================

def transcribe_audio(wav_path: str) -> str:
    """Transcribe WAV file using Vosk Vietnamese model."""
    recognizer = KaldiRecognizer(model, SAMPLE_RATE)
    recognizer.SetWords(True)

    # Read WAV file and feed to recognizer
    with open(wav_path, "rb") as f:
        # Skip WAV header (44 bytes)
        f.read(44)
        while True:
            data = f.read(4000)
            if len(data) == 0:
                break
            recognizer.AcceptWaveform(data)

    # Get final result
    result_json = recognizer.FinalResult()
    result = json.loads(result_json)
    text = result.get("text", "")

    return text

# ==================== HTTP SERVER ====================

class VoskHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/transcribe":
            self.send_error(404, "Not found. Use POST /transcribe")
            return

        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            audio_base64 = data.get("audio_base64", "")
            if not audio_base64:
                self._send_json(400, {"success": False, "error": "No audio_base64 provided"})
                return

            # Decode base64 audio
            audio_bytes = base64.b64decode(audio_base64)

            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as tmp_input:
                tmp_input.write(audio_bytes)
                tmp_input_path = tmp_input.name

            tmp_wav_path = tmp_input_path + ".wav"

            try:
                # Convert to 16kHz mono WAV
                if not convert_to_wav(tmp_input_path, tmp_wav_path):
                    self._send_json(500, {"success": False, "error": "Audio conversion failed"})
                    return

                # Transcribe
                text = transcribe_audio(tmp_wav_path)

                print(f"[Vosk] Transcribed: {text[:200]}")

                self._send_json(200, {
                    "success": True,
                    "text": text.strip(),
                })

            finally:
                # Cleanup temp files
                try:
                    os.unlink(tmp_input_path)
                    os.unlink(tmp_wav_path)
                except:
                    pass

        except Exception as e:
            print(f"[Vosk] Error: {str(e)}")
            self._send_json(500, {"success": False, "error": str(e)})

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "status": "live",
                "model": "vosk-model-vn-0.4",
                "language": "Vietnamese",
                "port": PORT,
            })
        else:
            self._send_json(200, {
                "name": "Vosk Vietnamese ASR",
                "endpoints": {
                    "POST /transcribe": "Transcribe audio (body: {audio_base64})",
                    "GET /health": "Health check",
                },
            })

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Suppress default logging
        pass

# ==================== START SERVER ====================

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), VoskHandler)
    print(f"[Vosk] ✅ Server ready on http://localhost:{PORT}")
    print(f"[Vosk] POST /transcribe with {{\"audio_base64\": \"...\"}}")
    print(f"[Vosk] GET /health for status")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Vosk] Shutting down...")
        server.shutdown()
