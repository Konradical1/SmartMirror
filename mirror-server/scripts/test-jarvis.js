#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import {
  appendHistory,
  runJarvisTurn,
} from '../src/jarvis/pipeline.js';
import {
  pcmToWav,
  recordAudioWithOptions,
  speakWithElevenLabs,
  transcribeAudio,
  transcriptIsUsable,
} from '../src/services/localVoiceService.js';
import { activeLlmProvider, llmConfig } from '../src/llm/client.js';
import { logger } from '../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const args = process.argv.slice(2);
const mode = args.includes('--voice') ? 'voice' : 'text';
const noPlay = args.includes('--no-play') || args.includes('--no-tts');
const once = args.includes('--once');
const textFlag = readFlag('--text');
const textCommand = textFlag.value;
const useLocal = args.includes('--local');
const mirrorBaseUrl = (readFlag('--mirror-base-url').value || process.env.MIRROR_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const mirrorSecret = process.env.ELEVENLABS_TOOL_SECRET || '';
const voiceId = readFlag('--voice-id').value || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const recordMs = Number(readFlag('--record-ms').value || process.env.VOICE_CHAT_RECORD_MS || process.env.VOICE_RECORD_MS || 6500);
const silenceFrames = Number(readFlag('--silence-frames').value || process.env.VOICE_CHAT_SILENCE_FRAMES || process.env.VOICE_SILENCE_FRAMES || 8);
const sttProvider = readFlag('--stt').value || process.env.STT_PROVIDER || 'elevenlabs';
const sttModel = readFlag('--stt-model').value || process.env.ELEVENLABS_STT_MODEL || process.env.STT_MODEL || 'scribe_v2';

const config = llmConfig(activeLlmProvider());

printHeader();
validateEnv();

if (mode === 'voice') {
  await runVoiceMode();
} else {
  await runTextMode();
}

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return { present: false, value: '' };
  const next = args[index + 1];
  if (!next || next.startsWith('--')) return { present: true, value: '' };
  return { present: true, value: next };
}

function printHeader() {
  console.log('\nJARVIS Test Runner');
  console.log(`LLM: ${config.name} (${config.model})`);
  console.log(`Mode: ${mode}`);
  console.log(`Runner: ${useLocal ? 'local pipeline' : mirrorBaseUrl}`);
  if (mode === 'voice') {
    console.log(`STT: ${sttProvider} (${sttModel})`);
    console.log(`TTS: ${noPlay ? 'disabled' : `ElevenLabs ${voiceId}`}`);
  }
  console.log('');
}

function validateEnv() {
  if (!config.apiKey) throw new Error(`${config.apiKeyName} not set.`);
  if (mode === 'voice' && !process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set.');
  }
}

async function runTextMode() {
  let history = [];

  if (textCommand) {
    const result = await handleInput(textCommand, history);
    printResult(result);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const input = await ask(rl, 'You: ');
    if (!input.trim()) continue;
    if (shouldStop(input)) break;
    const result = await handleInput(input, history);
    history = appendHistory(history, input, result.speech);
    printResult(result);
    if (once) break;
  }
  rl.close();
}

async function runVoiceMode() {
  let history = [];
  logger.info('Continuous voice mode. Say stop, quit, exit, goodbye, or bye to end.');

  while (true) {
    logger.info('Listening...');
    const pcm = await recordAudioWithOptions(recordMs, { silenceFrames });
    const wav = await pcmToWav(pcm);
    const transcriptResult = await transcribeAudio(wav, {
      provider: sttProvider,
      sttModel,
      elevenLabsSttModel: sttModel,
    });

    const transcript = String(transcriptResult.text || '').trim();
    if (!transcript || !transcriptIsUsable(transcriptResult)) {
      logger.info('No usable speech detected.');
      if (once) break;
      continue;
    }

    console.log(`You: ${transcript}`);
    if (shouldStop(transcript)) {
      const farewell = 'Stopping now.';
      console.log(`Jarvis: ${farewell}`);
      if (!noPlay) await speakWithElevenLabs(farewell, voiceId, { play: true });
      break;
    }

    const result = await handleInput(transcript, history);
    history = appendHistory(history, transcript, result.speech);
    printResult(result);
    if (!noPlay) await speakWithElevenLabs(result.speech, voiceId, { play: true });
    if (once) break;
  }
}

async function handleInput(input, history) {
  if (useLocal) return runJarvisTurn(input, { history, broadcast: true });
  return postJarvisCommand(input, history);
}

async function postJarvisCommand(input, history) {
  const response = await fetch(`${mirrorBaseUrl}/jarvis-command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mirrorSecret ? { 'X-Mirror-Secret': mirrorSecret } : {}),
    },
    body: JSON.stringify({ input, history }),
  });

  const payload = await response.json().catch(async () => ({
    ok: false,
    speech: 'Jarvis response failed.',
    error: await response.text().catch(() => ''),
  }));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.speech || `Jarvis command failed: ${response.status}`);
  }

  return {
    ok: true,
    input,
    intent: payload.intent,
    params: payload.params || {},
    data: payload.data ?? null,
    ui: payload.ui ?? null,
    speech: payload.speech,
  };
}

function printResult(result) {
  console.log(`Intent: ${result.intent}`);
  console.log(`Params: ${JSON.stringify(result.params)}`);
  console.log(`Jarvis: ${result.speech}`);
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function shouldStop(text) {
  return /^(stop listening|stop|quit|exit|goodbye|bye)$/i.test(String(text).trim());
}
