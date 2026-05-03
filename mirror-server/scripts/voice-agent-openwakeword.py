#!/usr/bin/env python3
import asyncio
import base64
import glob
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
import websockets
import openwakeword
from openwakeword.model import Model

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH_BYTES = 2

REPO_ROOT = Path(__file__).resolve().parents[2]


def load_env_file(path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(REPO_ROOT / ".env")
load_env_file(REPO_ROOT / "mirror-server" / ".env")

MIRROR_BASE_URL = os.getenv("MIRROR_BASE_URL") or f"http://127.0.0.1:{os.getenv('PORT') or os.getenv('WS_PORT') or '3001'}"
MIRROR_SECRET = os.getenv("ELEVENLABS_TOOL_SECRET", "")
WAKE_MODEL = os.getenv("VOICE_WAKE_MODEL", "hey_jarvis")
WAKE_MODEL_PATH = os.getenv("VOICE_WAKE_MODEL_PATH", "")
WAKE_THRESHOLD = float(os.getenv("VOICE_WAKE_THRESHOLD", "0.45"))
PRE_ROLL_MS = int(os.getenv("VOICE_PRE_ROLL_MS", "1200"))
FRAME_MS = int(os.getenv("VOICE_FRAME_MS", "80"))
IDLE_SESSION_MS = int(os.getenv("VOICE_IDLE_SESSION_MS", "9000"))
MAX_SESSION_MS = int(os.getenv("VOICE_MAX_SESSION_MS", "30000"))
ARECORD_DEVICE = os.getenv("VOICE_ARECORD_DEVICE", "")
VOICE_LOG_PATH = os.getenv("VOICE_LOG_PATH", "/tmp/smartmirror-voice.log")
SUPPRESS_FIRST_AGENT_TURN = os.getenv("VOICE_SUPPRESS_FIRST_AGENT_TURN", "true").lower() != "false"

FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000
FRAME_BYTES = FRAME_SAMPLES * SAMPLE_WIDTH_BYTES
PRE_ROLL_FRAMES = max(1, PRE_ROLL_MS // FRAME_MS)

active_session = None
shutdown_requested = False


def log(message):
    text = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}"
    print(text, flush=True)
    try:
        with open(VOICE_LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")
    except Exception:
        pass


def request_json(method, url, payload=None):
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if MIRROR_SECRET:
        headers["X-Mirror-Secret"] = MIRROR_SECRET

    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            data = response.read().decode("utf-8")
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{url} failed with {error.code}: {detail}") from error


def post_voice_status(status, text=""):
    try:
        request_json("POST", f"{MIRROR_BASE_URL}/voice-status", {"status": status, "text": text})
    except Exception as error:
        log(f"voice-status failed: {error}")


def get_signed_url():
    data = request_json("GET", f"{MIRROR_BASE_URL}/elevenlabs-signed-url")
    signed_url = data.get("signed_url")
    if not signed_url:
        raise RuntimeError(data.get("error") or "Mirror server did not return signed_url")
    return signed_url


def start_arecord():
    command = ["arecord", "-q", "-r", str(SAMPLE_RATE), "-c", str(CHANNELS), "-f", "S16_LE", "-t", "raw"]
    if ARECORD_DEVICE:
        command[1:1] = ["-D", ARECORD_DEVICE]
    return subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def start_aplay():
    return subprocess.Popen(
        ["aplay", "-q", "-t", "raw", "-f", "S16_LE", "-r", str(SAMPLE_RATE), "-c", str(CHANNELS)],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def resolve_wake_model_path():
    if WAKE_MODEL_PATH:
        return WAKE_MODEL_PATH
    if os.path.exists(WAKE_MODEL):
        return WAKE_MODEL

    model_dir = Path(openwakeword.__file__).resolve().parent / "resources" / "models"
    matches = sorted(glob.glob(str(model_dir / f"{WAKE_MODEL}*.onnx")))
    if matches:
        return matches[0]
    raise RuntimeError(f"Could not find openWakeWord model for {WAKE_MODEL}. Set VOICE_WAKE_MODEL_PATH to an .onnx model.")


def conversation_initiation_payload():
    return {"type": "conversation_initiation_client_data"}


def is_first_prompt(text):
    normalized = " ".join(text.lower().replace("?", "").split())
    return normalized in {
        "what do you want",
        "what would you like",
        "how can i help",
        "how can i help you",
        "how may i help",
        "how may i help you",
    }


class ElevenLabsSession:
    def __init__(self, buffered_frames):
        self.buffered_frames = list(buffered_frames)
        self.queue = asyncio.Queue(maxsize=200)
        self.started_at = time.monotonic()
        self.last_activity = self.started_at
        self.closed = False
        self.suppressing_first_prompt = SUPPRESS_FIRST_AGENT_TURN
        self.suppressed_audio_event_ids = set()
        self.task = asyncio.create_task(self.run())

    def push_audio(self, frame):
        if self.closed:
            return
        try:
            self.queue.put_nowait(bytes(frame))
        except asyncio.QueueFull:
            pass

    async def close(self, status="idle", text=""):
        global active_session
        if self.closed:
            return
        self.closed = True
        active_session = None
        post_voice_status(status, text)

    async def run(self):
        player = None
        try:
            post_voice_status("wake_detected", WAKE_MODEL)
            signed_url = get_signed_url()
            player = start_aplay()

            async with websockets.connect(signed_url, max_size=8 * 1024 * 1024) as websocket:
                await websocket.send(json.dumps(conversation_initiation_payload()))
                post_voice_status("listening", "Listening")

                for frame in self.buffered_frames:
                    await self.send_audio(websocket, frame)

                sender = asyncio.create_task(self.sender(websocket))
                receiver = asyncio.create_task(self.receiver(websocket, player))
                watchdog = asyncio.create_task(self.watchdog())

                done, pending = await asyncio.wait(
                    {sender, receiver, watchdog},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                for task in done:
                    task.result()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            log(f"voice session failed: {error}")
            await self.close("error", str(error))
        finally:
            if player and player.stdin:
                try:
                    player.stdin.close()
                except BrokenPipeError:
                    pass
            if player:
                try:
                    player.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    player.terminate()
            await self.close()

    async def sender(self, websocket):
        while not self.closed:
            frame = await self.queue.get()
            await self.send_audio(websocket, frame)

    async def send_audio(self, websocket, frame):
        await websocket.send(json.dumps({"user_audio_chunk": base64.b64encode(frame).decode("ascii")}))

    async def receiver(self, websocket, player):
        async for raw in websocket:
            self.last_activity = time.monotonic()
            event = json.loads(raw)
            event_type = event.get("type")

            if event_type == "ping":
                await websocket.send(json.dumps({"type": "pong", "event_id": event.get("ping_event", {}).get("event_id")}))
            elif event_type == "user_transcript":
                text = event.get("user_transcription_event", {}).get("user_transcript", "")
                if text:
                    log(f"User transcript: {text}")
                post_voice_status("thinking", text)
            elif event_type == "agent_response":
                text = event.get("agent_response_event", {}).get("agent_response", "")
                if text:
                    log(f"Agent response: {text}")
                if self.suppressing_first_prompt and is_first_prompt(text):
                    self.suppressing_first_prompt = False
                    log("Suppressed agent first prompt")
                    continue
                self.suppressing_first_prompt = False
                post_voice_status("speaking", text)
            elif event_type == "audio":
                event_id = event.get("audio_event", {}).get("event_id")
                if self.suppressing_first_prompt:
                    if event_id is not None:
                        self.suppressed_audio_event_ids.add(event_id)
                    continue
                if event_id in self.suppressed_audio_event_ids:
                    continue
                audio = base64.b64decode(event.get("audio_event", {}).get("audio_base_64", ""))
                if audio and player.stdin:
                    player.stdin.write(audio)
                    player.stdin.flush()
            elif event_type == "agent_response_complete":
                await self.close()
                return

    async def watchdog(self):
        while not self.closed:
            await asyncio.sleep(0.5)
            now = time.monotonic()
            if (now - self.last_activity) * 1000 > IDLE_SESSION_MS:
                await self.close()
                return
            if (now - self.started_at) * 1000 > MAX_SESSION_MS:
                await self.close()
                return


async def main():
    global active_session, shutdown_requested

    wake_model_path = resolve_wake_model_path()
    log(f"Loading openWakeWord model: {wake_model_path}")
    model = Model(wakeword_model_paths=[wake_model_path])
    wake_label = next(iter(model.models.keys()))
    pre_roll = deque(maxlen=PRE_ROLL_FRAMES)
    recorder = start_arecord()
    post_voice_status("idle", "Wake listener ready")
    log(f"Listening for {wake_label} at threshold {WAKE_THRESHOLD}.")

    while not shutdown_requested:
      raw = await asyncio.to_thread(recorder.stdout.read, FRAME_BYTES)
      if len(raw) != FRAME_BYTES:
          stderr = recorder.stderr.read().decode("utf-8", errors="replace") if recorder.stderr else ""
          raise RuntimeError(f"arecord stopped. {stderr}".strip())

      pre_roll.append(raw)

      if active_session:
          active_session.push_audio(raw)
          continue

      frame = np.frombuffer(raw, dtype=np.int16)
      predictions = model.predict(frame)
      score = float(predictions.get(wake_label, 0.0))
      if score >= WAKE_THRESHOLD:
          log(f"Wake detected: {wake_label} score={score:.3f}")
          buffered_frames = list(pre_roll)
          active_session = ElevenLabsSession(buffered_frames)

    recorder.terminate()


def handle_signal(signum, frame):
    global shutdown_requested
    shutdown_requested = True


if __name__ == "__main__":
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    asyncio.run(main())
