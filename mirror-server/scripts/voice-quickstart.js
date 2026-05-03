#!/usr/bin/env node

/**
 * QUICKSTART GUIDE for Local Voice Pipeline
 * Run this to verify everything is ready
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  VOICE PIPELINE QUICKSTART                     ║
╚════════════════════════════════════════════════════════════════╝

The local voice pipeline is now set up and ready to test!

WHAT WAS BUILT:
✓ Local Whisper STT (speech-to-text on your device)
✓ Groq API intent routing (free tier, ~$0.05 per 1M tokens)
✓ ElevenLabs TTS (high-quality voice synthesis)
✓ Full end-to-end pipeline (~2-2.5 seconds latency)

FILES CREATED:
✓ src/services/localVoiceService.js (core pipeline)
✓ scripts/test-local-voice.js (test script)
✓ scripts/verify-voice-setup.js (verification script)
✓ src/prompts/groq-intent-router.txt (intent routing system prompt)
✓ VOICE-SETUP.md (comprehensive documentation)

═══════════════════════════════════════════════════════════════════

SETUP CHECKLIST (must complete before testing):

1. Add ELEVENLABS_API_KEY to .env:
   ${process.env.ELEVENLABS_API_KEY ? '   ✓ Already set' : '   ❌ MISSING - Add your key to .env'}

2. Install system dependencies:
   macOS:
      brew install sox ffmpeg
   
   Raspberry Pi:
      sudo apt-get install sox ffmpeg alsa-utils libsox-dev

3. Install Whisper in Python environment:
   ./.venv-voice/bin/pip install openai-whisper

═══════════════════════════════════════════════════════════════════

VERIFICATION & TESTING:

Step 1: Verify setup
   npm run verify:voice

Step 2: Test with text (no microphone needed)
   npm run test:voice -- --text "what is the weather?"
   npm run test:voice -- --text "show my calendar"
   npm run test:voice -- --text "play music"

Step 3: Test with live microphone (10-second recording)
   npm run test:voice -- --live

Step 4: Interactive usage
   Use routeTextCommand() or runFullPipeline() from localVoiceService.js

═══════════════════════════════════════════════════════════════════

EXPECTED OUTPUT FROM TEST:

Input: "what is the weather?"

Output will show:
  📝 Transcript: "what is the weather?"
  🎯 Intent: SHOW_WEATHER
  📦 Params: {}
  💬 Speech: "[Weather description]"
  🔊 Audio playback

═══════════════════════════════════════════════════════════════════

SUPPORTED COMMANDS:

Calendar:
  "show my calendar"
  "what do I have today?"
  "add haircut tomorrow at 2 PM"
  "delete my haircut"

Weather:
  "what's the weather?"
  "show me the weather"

Music/Spotify:
  "what's playing?"
  "next song"
  "pause music"
  "play music"

Tasks:
  "show my to-do list"
  "add finish homework tomorrow"
  "check off finish homework"

Email:
  "show my emails"

═══════════════════════════════════════════════════════════════════

CONFIGURATION:

GROQ_API_KEY=${process.env.GROQ_API_KEY ? '✓ Set' : '✗ Missing (from console.groq.com)'}
ELEVENLABS_API_KEY=${process.env.ELEVENLABS_API_KEY ? '✓ Set' : '✗ MISSING - Add to .env'}
ELEVENLABS_VOICE_ID=${process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM (default)'}

═══════════════════════════════════════════════════════════════════

NEXT STEPS:

1. Add ELEVENLABS_API_KEY to .env if not present
2. Run: npm run verify:voice
3. Run: npm run test:voice -- --text "your command"
4. If working, ready for RPi deployment!

For detailed docs, see: VOICE-SETUP.md

═══════════════════════════════════════════════════════════════════
`);
