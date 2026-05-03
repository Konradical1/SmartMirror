# Local Voice Pipeline (Whisper + Groq + ElevenLabs)

A hybrid local/remote voice processing pipeline for the smart mirror. Combines **local speech-to-text (Whisper)** with **remote LLM intent routing (Groq)** and **high-quality speech synthesis (ElevenLabs TTS)**.

## Architecture

```
┌─────────────────────┐
│  Microphone Input   │
└──────────┬──────────┘
           │
    ┌──────▼──────┐
    │  Whisper    │  (Local STT - 150ms)
    │   (base)    │
    └──────┬──────┘
           │
    ┌──────▼──────────┐
    │ Groq API        │  (Remote LLM - 500-800ms)
    │ (mixtral-8x7b)  │
    └──────┬──────────┘
           │
    ┌──────▼──────────────┐
    │ ElevenLabs API      │  (Remote TTS - 1000-1500ms)
    │ (high-quality voice)│
    └──────┬──────────────┘
           │
┌──────────▼──────────┐
│  Speaker Output     │
│  (~2-2.5s total)    │
└─────────────────────┘
```

## Setup

### 1. Install Dependencies

The npm dependencies are already configured in `mirror-server/package.json`. To install them:

```bash
cd mirror-server
npm install
```

### 2. Get API Keys

#### Groq (Free Tier)
- Go to [console.groq.com](https://console.groq.com)
- Sign up for a free account
- Generate an API key (free tier: 9,000 requests/day)
- Copy your API key

#### ElevenLabs (Already Configured)
- Your API key should already be in `.env` as `ELEVENLABS_API_KEY`
- Optional voice IDs available at [elevenlabs.io/app/voice-lab](https://elevenlabs.io/app/voice-lab)

### 3. Configure `.env`

Add the following to `.env` in the project root:

```env
# Groq API (free tier: 9K requests/day)
GROQ_API_KEY=your-groq-api-key-here

# ElevenLabs Voice ID (default: Adam)
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

The `ELEVENLABS_API_KEY` should already be configured.

### 4. System Dependencies

#### On macOS
```bash
# Install audio dependencies
brew install sox ffmpeg
```

#### On Raspberry Pi (Debian/Ubuntu)
```bash
sudo apt-get install -y \
  alsa-utils \
  sox \
  ffmpeg \
  libsox-dev \
  libsox-fmt-all
```

#### Whisper Installation
The local Whisper model runs via subprocess. Ensure Python environment has it:

```bash
# If not already installed in the voice environment
cd mirror-server
.venv-voice/bin/pip install openai-whisper

# Verify installation
.venv-voice/bin/python -m whisper --help
```

## Usage

### Test with Text Command

```bash
cd mirror-server
npm run test:voice -- --text "what is the weather?"
```

### Test with Live Microphone Input

```bash
cd mirror-server
npm run test:voice -- --live
```

The script will record for 10 seconds. Speak your command clearly.

### Disable Audio Playback

To skip TTS synthesis and audio playback (useful for testing):

```bash
npm run test:voice -- --live --no-play
npm run test:voice -- --text "show my calendar" --no-play
```

## Example Output

```
╔════════════════════════════════════════════════════╗
║         ALEX Local Voice Pipeline Test              ║
╚════════════════════════════════════════════════════╝

📦 Configuration:
   Groq Model: mixtral-8x7b-32768
   Whisper Model: base
   ElevenLabs Voice ID: 21m00Tcm4TlvDq8ikWAM
   Audio Playback: enabled

🎤 Input Mode: Text Command
📝 Command: "what is the weather?"

=== INTENT ROUTING ===
📝 Transcript: "what is the weather?"

🎯 Intent: SHOW_WEATHER
📦 Params: {}
💬 Speech:
   "Clear skies today, with a high of 72 degrees and light winds from the west."

✨ Pipeline completed successfully!
```

## Supported Intents

The Groq intent router recognizes the following mirror commands:

### Display
- `SHOW_WEATHER` — Display weather
- `SHOW_CALENDAR` — Display calendar events
- `SHOW_SPOTIFY` — Show current Spotify track
- `SHOW_TODO` — Display to-do list
- `SHOW_EMAIL` — Display emails
- `DISPLAY_MESSAGE` — Show a message

### Calendar
- `ADD_CALENDAR_EVENT` — Add event (extract title, date, time)
- `EDIT_CALENDAR_EVENT` — Edit event
- `DELETE_CALENDAR_EVENT` — Delete event

### Music
- `SPOTIFY_PLAY` — Resume playback
- `SPOTIFY_PAUSE` — Pause playback
- `SPOTIFY_NEXT` — Skip to next song
- `SPOTIFY_PREVIOUS` — Go to previous song

### Tasks
- `ADD_TODO` — Add task
- `CHECK_TODO` — Mark task as complete

### System
- `IDLE` — Return to home screen

## Performance

Expected latencies on different hardware:

### Desktop/Laptop (4-core CPU)
- **Whisper**: 100-150ms
- **Groq API**: 500-800ms
- **ElevenLabs TTS**: 1000-1500ms
- **Total**: 1.6-2.5 seconds

### Raspberry Pi 4 (4GB)
- **Whisper**: 200-300ms
- **Groq API**: 500-800ms
- **ElevenLabs TTS**: 1000-1500ms
- **Total**: 1.7-2.6 seconds

### Raspberry Pi 5 (8GB)
- **Whisper**: 150-200ms
- **Groq API**: 500-800ms
- **ElevenLabs TTS**: 1000-1500ms
- **Total**: 1.65-2.5 seconds

## Troubleshooting

### "GROQ_API_KEY not set"
Ensure you've added the key to `.env`:
```env
GROQ_API_KEY=your-actual-key-here
```

### "No audio device found"
On Linux/Pi, specify the audio device:
```bash
AUDIO_DEVICE=default npm run test:voice -- --live
```

### "Whisper command not found"
Ensure Whisper is installed in the Python environment:
```bash
cd mirror-server
.venv-voice/bin/pip install openai-whisper
```

### "ffmpeg not found"
Install ffmpeg: 
- macOS: `brew install ffmpeg`
- Raspberry Pi: `sudo apt-get install ffmpeg`

### Recording Issues on macOS
The `mic` package requires audio input permissions. Grant permission via:
1. System Preferences → Security & Privacy → Microphone
2. Allow Terminal or your IDE

### Network Timeout
If Groq API times out, check:
1. Internet connection
2. Groq API status at [status.groq.com](https://status.groq.com)
3. Rate limiting (free tier is 9K requests/day)

## Integration with Mirror Server

The pipeline is designed to integrate with the existing mirror-server intent system:

```javascript
// In mirror-server handlers
import { routeTextCommand } from './services/localVoiceService.js';

const result = await routeTextCommand(userVoiceInput, {
  groqSystemPrompt: systemPrompt,
  voiceId: process.env.ELEVENLABS_VOICE_ID,
  play: true,
});

// Handle intent
await handleIntent(result.intent, result.params, result.speech);
```

## Future Enhancements

1. **Local LLM Fallback**: Add Ollama/llama.cpp as fallback when Groq is unavailable
2. **Streaming TTS**: Use ElevenLabs streaming API for lower latency
3. **Wake Word Integration**: Combine with OpenWakeWord detection for trigger-based input
4. **Interrupt Handling**: Add cancellation tokens to stop processing mid-pipeline
5. **Custom Voices**: Support custom voice cloning via ElevenLabs
6. **Multi-language**: Support non-English voice commands

## Files

- [`mirror-server/src/services/localVoiceService.js`](../src/services/localVoiceService.js) — Core pipeline service
- [`mirror-server/scripts/test-local-voice.js`](../scripts/test-local-voice.js) — CLI test script
- [`mirror-server/src/prompts/groq-intent-router.txt`](../src/prompts/groq-intent-router.txt) — LLM system prompt

## Costs

- **Whisper**: Free (runs locally on device)
- **Groq**: Free tier (9K requests/day), ~$0.05/1M tokens for production
- **ElevenLabs**: Existing budget (depends on your plan)
- **Total monthly estimate**: ~$2-5 for moderate daily use

## References

- [Groq Console](https://console.groq.com)
- [Whisper GitHub](https://github.com/openai/whisper)
- [ElevenLabs API Docs](https://elevenlabs.io/docs)
- [mic NPM Package](https://www.npmjs.com/package/mic)
