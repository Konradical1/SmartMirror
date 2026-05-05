# Smart Mirror Integration Server

This is the Smart Mirror Integration Server, or "mirror OS". It sits between ElevenLabs and the React mirror UI.

```text
ElevenLabs
  -> POST /mirror-command
  -> mirror-server intent execution
  -> Spotify / Calendar / Notion / Weather
  -> WebSocket ACTION + DATA_UPDATE
  -> React UI
```

The React UI stays display-only. It connects to:

```text
ws://localhost:3001
```

## Setup

From the repo root:

```bash
npm install
npm --prefix mirror-server install
```

This server loads your existing root `.env` first:

```text
../.env
```

Then it loads `mirror-server/.env` for server-only defaults.

Required server env:

```bash
PORT=3001
WS_PORT=3001
ELEVENLABS_TOOL_SECRET=super_secret_key
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
NGROK_AUTHTOKEN=
```

It also supports your existing integration env:

```bash
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=primary
CALENDAR_TIMEZONE=America/New_York

NOTION_API_KEY=
NOTION_DATABASE_ID=
NOTION_TITLE_PROPERTY=
NOTION_DONE_PROPERTY=Status
NOTION_DONE_STATUS=Done
NOTION_TAG_PROPERTY=Tag
NOTION_DATE_PROPERTY=Due date

WEATHER_LOCATION=Anderson Township, OH
WEATHER_LATITUDE=39.0714
WEATHER_LONGITUDE=-84.3505
WEATHER_TIMEZONE=America/New_York
```

## Run Server

From repo root:

```bash
npm run integrations
```

Or directly:

```bash
npm --prefix mirror-server run dev
```

The server starts:

- React mirror UI
- Express HTTP server
- WebSocket server on the same port
- API polling for weather, Spotify, Calendar, and Notion
- Optional ngrok tunnel if `NGROK_AUTHTOKEN` is set

## ElevenLabs Config

Create an ElevenLabs server tool:

```text
POST https://<ngrok-url>/mirror-command
```

Header:

```text
X-Mirror-Secret: super_secret_key
```

Request body:

```json
{
  "intent": "SHOW_WEATHER",
  "params": {},
  "speech": ""
}
```

Response:

```json
{
  "ok": true,
  "speech": "54 degrees and partly cloudy in Anderson Township, sir. Feels like 45.",
  "data": {}
}
```

Important: the server is authoritative for speech. ElevenLabs may send `speech`, but connected intents generate their final response from live data. The returned `speech` is also sent to the UI overlay, so ElevenLabs should speak the returned `speech` exactly.

## Supported Intents

```text
SHOW_WEATHER
SHOW_CALENDAR
ADD_CALENDAR_EVENT
EDIT_CALENDAR_EVENT
DELETE_CALENDAR_EVENT
SHOW_SPOTIFY
SPOTIFY_NEXT
SPOTIFY_PREVIOUS
SPOTIFY_PAUSE
SPOTIFY_PLAY
SHOW_TODO
ADD_TODO
CHECK_TODO
SHOW_EMAIL
DISPLAY_MESSAGE
IDLE
```

Use `DISPLAY_MESSAGE` whenever ElevenLabs is about to speak a response that does not otherwise open a panel or run an action. It mirrors the exact spoken text to the UI bottom overlay without changing the current scene.

```json
{
  "intent": "DISPLAY_MESSAGE",
  "params": {},
  "speech": "Yes, sir. Riveting stuff."
}
```

## Voice Status

The Raspberry Pi wake-word listener can update the mirror UI without running an intent:

```text
POST http://<mirror-host>:3001/voice-status
X-Mirror-Secret: super_secret_key
```

```json
{
  "status": "wake_detected",
  "text": "Wake word detected"
}
```

Supported statuses:

```text
idle
wake_detected
listening
thinking
speaking
error
```

## Raspberry Pi Wake Word

The Pi voice daemon uses openWakeWord locally, so it does not require Picovoice or a cloud wake-word key. The default model is `hey_jarvis`. For best results with `jarvis`, `hey jarvis`, and `yo jarvis`, train or download a custom openWakeWord model and set `VOICE_WAKE_MODEL` to that model path.

Required env:

```bash
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
MIRROR_BASE_URL=http://127.0.0.1:3001
VOICE_WAKE_MODEL=hey_jarvis
VOICE_WAKE_MODEL_PATH=
VOICE_WAKE_THRESHOLD=0.45
VOICE_ARECORD_DEVICE=
VOICE_FRAME_MS=80
VOICE_PRE_ROLL_MS=1200
VOICE_IDLE_SESSION_MS=9000
VOICE_MAX_SESSION_MS=30000
```

Install the Python voice dependencies on the Pi:

```bash
cd mirror-server
python3 -m venv .venv-voice
.venv-voice/bin/pip install -r requirements-voice.txt
cd ..
```

Run it after the mirror server is running:

```bash
npm --prefix mirror-server run voice
```

Audio path:

```text
USB mic -> arecord -> openWakeWord -> 1.2s pre-roll buffer -> ElevenLabs signed Agent WebSocket -> PCM audio playback with aplay
```

Check microphone detection on the Pi:

```bash
arecord -l
```

If multiple capture devices are listed, set `VOICE_ARECORD_DEVICE` to the ALSA device name, for example `plughw:1,0`. Leave it empty to use the system default.

Todo examples:

```json
{
  "intent": "ADD_TODO",
  "params": {
    "title": "finish math homework",
    "tag": "School",
    "date": "2026-05-08"
  },
  "speech": ""
}
```

```json
{
  "intent": "CHECK_TODO",
  "params": {
    "title": "finish math homework"
  },
  "speech": ""
}
```

Calendar search example:

```json
{
  "intent": "SHOW_CALENDAR",
  "params": {
    "query": "haircut"
  },
  "speech": ""
}
```

Calendar write examples:

```json
{
  "intent": "ADD_CALENDAR_EVENT",
  "params": {
    "title": "haircut",
    "date": "tomorrow",
    "time": "2 PM",
    "durationMinutes": 60
  },
  "speech": ""
}
```

All-day event example:

```json
{
  "intent": "ADD_CALENDAR_EVENT",
  "params": {
    "title": "AP 2D submission deadline",
    "date": "Thursday"
  },
  "speech": ""
}
```

```json
{
  "intent": "EDIT_CALENDAR_EVENT",
  "params": {
    "query": "haircut",
    "date": "next friday",
    "time": "3 PM"
  },
  "speech": ""
}
```

```json
{
  "intent": "DELETE_CALENDAR_EVENT",
  "params": {
    "query": "haircut"
  },
  "speech": ""
}
```

Calendar writes require the Google Calendar events scope. If your `GOOGLE_REFRESH_TOKEN` was created before this feature, run this again and replace the token in `.env`:

```bash
npm run auth:google
```

## Testing

Start the React UI and mirror OS:

```bash
npm run integrations
```

Test Jarvis with text:

```bash
npm --prefix mirror-server run test:jarvis -- --text "what's the weather"
```

Or run continuous voice mode:

```bash
npm --prefix mirror-server run test:jarvis -- --voice
```

Expected result:

- UI receives WebSocket messages
- Correct panel opens
- HTTP response returns `{ "ok": true, "speech": "..." }`
