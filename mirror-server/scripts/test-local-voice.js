#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFullPipeline, routeTextCommand } from '../src/services/localVoiceService.js';
import { logger } from '../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

// Load Groq intent routing prompt
const promptPath = path.resolve(__dirname, '../src/prompts/groq-intent-router.txt');
const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

// Parse CLI arguments
const args = process.argv.slice(2);
const isLive = args.includes('--live');
const textIndex = args.indexOf('--text');
const textCommand = textIndex !== -1 ? args.slice(textIndex + 1).join(' ') : null;
const noPlay = args.includes('--no-play');

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         ALEX Local Voice Pipeline Test              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  // Show usage if no args
  if (!textCommand && !isLive) {
    console.log('📖 Usage:\n');
    console.log('   Live microphone input:');
    console.log('     npm run test:voice -- --live\n');
    console.log('   Text command:');
    console.log('     npm run test:voice -- --text "what is the weather?"\n');
    console.log('   Disable audio playback:');
    console.log('     npm run test:voice -- --live --no-play\n');
    process.exit(0);
  }

  // Validate environment
  if (!process.env.GROQ_API_KEY) {
    console.error('\n❌ GROQ_API_KEY not set. Please add it to .env:\n   GROQ_API_KEY=your-groq-api-key\n');
    process.exit(1);
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('\n❌ ELEVENLABS_API_KEY not set. Please add it to .env\n');
    process.exit(1);
  }

  console.log(`📦 Configuration:`);
  console.log(`   Groq Model: mixtral-8x7b-32768`);
  console.log(`   Whisper Model: base`);
  console.log(`   ElevenLabs Voice ID: ${voiceId}`);
  console.log(`   Audio Playback: ${noPlay ? 'disabled' : 'enabled'}\n`);

  try {
    let result;

    if (textCommand) {
      // Text mode
      console.log(`🎤 Input Mode: Text Command`);
      console.log(`📝 Command: "${textCommand}"\n`);

      result = await routeTextCommand(textCommand, {
        groqSystemPrompt: systemPrompt,
        voiceId,
        play: !noPlay,
      });
    } else if (isLive) {
      // Live microphone mode
      console.log(`🎤 Input Mode: Live Microphone`);
      console.log(`⏱️  Recording for 10 seconds... Speak now!\n`);

      result = await runFullPipeline({
        durationMs: 10000,
        whisperModel: 'base',
        groqSystemPrompt: systemPrompt,
        voiceId,
        play: !noPlay,
      });
    }

    // Display results
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║                    RESULTS                         ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    if (result.success) {
      console.log('✅ SUCCESS\n');

      if (result.transcript) {
        console.log(`📝 Transcript:\n   "${result.transcript}"\n`);
      }

      console.log(`🎯 Intent: ${result.intent}`);
      console.log(`📦 Params: ${JSON.stringify(result.params, null, 2)}`);
      console.log(`💬 Speech:\n   "${result.speech}"\n`);

      console.log('✨ Pipeline completed successfully!\n');
    } else {
      console.log(`❌ FAILED\n`);
      console.log(`Error: ${result.error}\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
