#!/usr/bin/env node

import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeLlmProvider, llmConfig } from '../src/llm/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     Local Voice Pipeline - Setup Verification       ║');
console.log('╚════════════════════════════════════════════════════╝\n');

const checks = [];
const sttProvider = (process.env.STT_PROVIDER || 'elevenlabs').toLowerCase();
const ttsProvider = (process.env.TTS_PROVIDER || process.env.VOICE_TTS_PROVIDER || 'elevenlabs').toLowerCase();

// Check API Keys
console.log('🔑 Checking API Keys...');
const llm = llmConfig(activeLlmProvider());
checks.push({
  name: llm.apiKeyName,
  ok: !!llm.apiKey,
  message: llm.apiKey ? `✅ Configured (${llm.name})` : `❌ Missing for ${llm.name}`,
});

if (sttProvider === 'elevenlabs' || sttProvider === 'scribe' || ttsProvider === 'elevenlabs') {
  checks.push({
    name: 'ELEVENLABS_API_KEY',
    ok: !!process.env.ELEVENLABS_API_KEY,
    message: process.env.ELEVENLABS_API_KEY ? '✅ Configured' : '❌ Missing',
  });
}

if (sttProvider === 'deepgram' || sttProvider === 'dg') {
  checks.push({
    name: 'DEEPGRAM_API_KEY',
    ok: !!process.env.DEEPGRAM_API_KEY,
    message: process.env.DEEPGRAM_API_KEY ? '✅ Configured' : '❌ Missing',
  });
}

if (ttsProvider === 'inworld') {
  checks.push({
    name: 'INWORLD_API_KEY',
    ok: !!process.env.INWORLD_API_KEY,
    message: process.env.INWORLD_API_KEY ? '✅ Configured' : '❌ Missing',
  });
  checks.push({
    name: 'INWORLD_VOICE_ID',
    ok: true,
    message: `✅ Using ${process.env.INWORLD_VOICE_ID || 'Dennis'} voice`,
  });
} else {
  checks.push({
    name: 'ELEVENLABS_VOICE_ID',
    ok: !!process.env.ELEVENLABS_VOICE_ID,
    message: process.env.ELEVENLABS_VOICE_ID ? `✅ Configured (${process.env.ELEVENLABS_VOICE_ID})` : '⚠️  Using default',
  });
}

checks.push({
  name: 'STT_PROVIDER',
  ok: true,
  message: `✅ Using ${sttProvider} STT`,
});

checks.push({
  name: 'TTS_PROVIDER',
  ok: true,
  message: `✅ Using ${ttsProvider} TTS`,
});

// Check system commands
console.log('\n🛠️  Checking System Dependencies...');

function checkCommand(cmd, name) {
  return new Promise((resolve) => {
    const proc = spawn('which', [cmd], { stdio: 'pipe' });
    proc.on('close', (code) => {
      checks.push({
        name,
        ok: code === 0,
        message: code === 0 ? '✅ Installed' : `❌ Missing (Install: ${cmd})`,
      });
      resolve();
    });
  });
}

function checkWhisper() {
  return new Promise((resolve) => {
    if (['elevenlabs', 'scribe', 'deepgram', 'dg'].includes(sttProvider)) {
      checks.push({
        name: 'Whisper (openai-whisper)',
        ok: true,
        message: `ℹ️  Optional fallback only (${sttProvider} STT is configured)`,
      });
      resolve();
      return;
    }

    const envWhisper = process.env.WHISPER_BIN?.trim();
    const venvWhisper = path.resolve(__dirname, '../.venv-voice/bin/whisper');

    if (envWhisper) {
      checks.push({
        name: 'Whisper (openai-whisper)',
        ok: true,
        message: `✅ Configured (${envWhisper})`,
      });
      resolve();
      return;
    }

    if (fs.existsSync(venvWhisper)) {
      checks.push({
        name: 'Whisper (openai-whisper)',
        ok: true,
        message: `✅ Installed (${venvWhisper})`,
      });
      resolve();
      return;
    }

    const proc = spawn('which', ['whisper'], { stdio: 'pipe' });
    proc.on('close', (code) => {
      checks.push({
        name: 'Whisper (openai-whisper)',
        ok: code === 0,
        message: code === 0 ? '✅ Installed' : '❌ Missing (Install: openai-whisper)',
      });
      resolve();
    });
  });
}

await Promise.all([
  checkWhisper(),
  checkCommand('ffmpeg', 'FFmpeg'),
  checkCommand('sox', 'SoX'),
  ...(process.platform === 'linux' ? [checkCommand('arecord', 'ALSA arecord')] : []),
]);

// Check Node modules
console.log('\n📦 Checking Node Modules...');

const modules = ['mic', 'wav-encoder', 'dotenv'];
for (const mod of modules) {
  try {
    await import(mod);
    checks.push({
      name: `npm: ${mod}`,
      ok: true,
      message: '✅ Installed',
    });
  } catch {
    checks.push({
      name: `npm: ${mod}`,
      ok: false,
      message: '❌ Missing',
    });
  }
}

// Print results
console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║                    RESULTS                         ║');
console.log('╚════════════════════════════════════════════════════╝\n');

let allOk = true;
checks.forEach((check) => {
  if (!check.ok) allOk = false;
  console.log(`${check.message} — ${check.name}`);
});

console.log('\n');
if (allOk) {
  console.log('✨ All checks passed! Ready to run test:jarvis\n');
} else {
  console.log('⚠️  Some checks failed. See messages above.\n');
  console.log('Next steps:');
  console.log(`  1. Add ${llm.apiKeyName}, your STT key, and your TTS key to .env`);
  console.log('  2. macOS: brew install ffmpeg sox');
  console.log('  3. Raspberry Pi: sudo apt-get install ffmpeg sox alsa-utils');
  console.log('  4. Optional fallback: .venv-voice/bin/pip install openai-whisper\n');
}
