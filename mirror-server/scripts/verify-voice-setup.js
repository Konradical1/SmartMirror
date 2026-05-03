#!/usr/bin/env node

import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     Local Voice Pipeline - Setup Verification       ║');
console.log('╚════════════════════════════════════════════════════╝\n');

const checks = [];

// Check API Keys
console.log('🔑 Checking API Keys...');
checks.push({
  name: 'GROQ_API_KEY',
  ok: !!process.env.GROQ_API_KEY,
  message: process.env.GROQ_API_KEY ? '✅ Configured' : '❌ Missing (Get from console.groq.com)',
});

checks.push({
  name: 'ELEVENLABS_API_KEY',
  ok: !!process.env.ELEVENLABS_API_KEY,
  message: process.env.ELEVENLABS_API_KEY ? '✅ Configured' : '❌ Missing',
});

checks.push({
  name: 'ELEVENLABS_VOICE_ID',
  ok: !!process.env.ELEVENLABS_VOICE_ID,
  message: process.env.ELEVENLABS_VOICE_ID ? `✅ Configured (${process.env.ELEVENLABS_VOICE_ID})` : '⚠️  Using default',
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

await Promise.all([
  checkCommand('whisper', 'Whisper (openai-whisper)'),
  checkCommand('ffmpeg', 'FFmpeg'),
  checkCommand('sox', 'SoX'),
]);

// Check Node modules
console.log('\n📦 Checking Node Modules...');

const modules = ['mic', 'speaker', 'wav-encoder', 'dotenv', 'openai'];
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
  console.log('✨ All checks passed! Ready to run npm run test:voice\n');
} else {
  console.log('⚠️  Some checks failed. See messages above.\n');
  console.log('Next steps:');
  console.log('  1. Add GROQ_API_KEY to .env (from console.groq.com)');
  console.log('  2. macOS: brew install ffmpeg sox');
  console.log('  3. Raspberry Pi: sudo apt-get install ffmpeg sox alsa-utils');
  console.log('  4. Whisper: .venv-voice/bin/pip install openai-whisper\n');
}
