import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Mic from 'mic';
import Speaker from 'speaker';
import WavEncoder from 'wav-encoder';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Record audio from microphone for specified duration
 * @param {number} durationMs - Duration to record in milliseconds
 * @returns {Promise<Buffer>} Raw PCM audio buffer
 */
export async function recordAudio(durationMs = 10000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const sampleRate = 16000;
    const channels = 1;
    const bitDepth = 16;

    logger.info('Starting microphone recording...');

    const micInstance = new Mic({
      rate: sampleRate,
      channels,
      exitOnSilence: false,
      debug: false,
      device: process.env.AUDIO_DEVICE || undefined,
    });

    const micStream = micInstance.getAudioStream();
    
    micStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    micStream.on('error', (err) => {
      logger.error('Recording error:', err.message);
      micInstance.stop();
      reject(err);
    });

    micInstance.start();

    const timeout = setTimeout(() => {
      micInstance.stop();
    }, durationMs);

    micStream.on('end', () => {
      clearTimeout(timeout);
      const audioBuffer = Buffer.concat(chunks);
      logger.info(`Recording complete: ${audioBuffer.length} bytes`);
      resolve(audioBuffer);
    });
  });
}

/**
 * Convert raw PCM buffer to WAV format
 * @param {Buffer} audioBuffer - Raw PCM audio buffer
 * @param {number} sampleRate - Sample rate (default 16000)
 * @returns {Promise<Buffer>} WAV-formatted audio buffer
 */
export async function pcmToWav(audioBuffer, sampleRate = 16000) {
  const audioData = new Float32Array(audioBuffer.length / 2);
  for (let i = 0; i < audioBuffer.length; i += 2) {
    audioData[i / 2] = audioBuffer.readInt16LE(i) / 32768;
  }

  const encoded = await WavEncoder.encode({
    sampleRate,
    channelData: [audioData],
  });

  return Buffer.from(encoded);
}

/**
 * Transcribe audio using local Whisper (via subprocess)
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {string} model - Whisper model size (tiny, base, small, medium)
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeWithWhisper(audioBuffer, model = 'base') {
  return new Promise(async (resolve, reject) => {
    try {
      // Write audio to temporary file
      const tempDir = path.resolve(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFile = path.join(tempDir, `audio-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, audioBuffer);

      logger.info(`Transcribing with Whisper (${model})...`);

      // Call whisper via subprocess
      const whisper = spawn('whisper', [tempFile, '--model', model, '--output_format', 'json', '--output_dir', tempDir, '--language', 'en', '--no_speech_threshold', '0.6'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisper.on('close', (code) => {
        if (code !== 0) {
          fs.unlinkSync(tempFile);
          logger.error('Whisper error:', stderr);
          reject(new Error(`Whisper failed: ${stderr}`));
          return;
        }

        try {
          const jsonFile = `${tempFile.replace('.wav', '.json')}`;
          const result = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
          const transcript = result.text || '';

          // Cleanup
          fs.unlinkSync(tempFile);
          fs.unlinkSync(jsonFile);

          logger.info(`Transcript: "${transcript}"`);
          resolve(transcript.trim());
        } catch (err) {
          logger.error('Failed to parse Whisper output:', err.message);
          reject(err);
        }
      });
    } catch (err) {
      logger.error('Transcription setup error:', err.message);
      reject(err);
    }
  });
}

/**
 * Route intent using Groq API
 * @param {string} transcript - User's speech transcript
 * @param {string} systemPrompt - System prompt for intent routing
 * @returns {Promise<Object>} Intent routing result: {intent, params, reasoning}
 */
export async function routeIntentWithGroq(transcript, systemPrompt) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not set in environment');
  }

  logger.info('Sending to Groq for intent routing...');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content || '';

    logger.info(`Groq response: ${content}`);

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Groq response did not contain valid JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intent: parsed.intent || 'DISPLAY_MESSAGE',
      params: parsed.params || {},
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    logger.error('Groq routing error:', err.message);
    throw err;
  }
}

/**
 * Synthesize speech using ElevenLabs API
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - ElevenLabs voice ID
 * @returns {Promise<Buffer>} Audio buffer
 */
export async function synthesizeWithElevenLabs(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set in environment');
  }

  logger.info(`Synthesizing with ElevenLabs (voice: ${voiceId})...`);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${error}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    logger.info(`TTS complete: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (err) {
    logger.error('TTS synthesis error:', err.message);
    throw err;
  }
}

/**
 * Play audio through speakers
 * @param {Buffer} audioBuffer - MP3 audio buffer (from ElevenLabs)
 * @returns {Promise<void>}
 */
export async function playAudio(audioBuffer) {
  return new Promise((resolve, reject) => {
    try {
      logger.info('Playing audio...');
      // For MP3 from ElevenLabs, we need ffmpeg to decode
      // Pipe to ffmpeg then to speaker
      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        'pipe:1',
      ]);

      const speaker = new Speaker({
        channels: 1,
        bitDepth: 16,
        sampleRate: 16000,
      });

      ffmpeg.stdout.pipe(speaker);
      ffmpeg.stdin.write(audioBuffer);
      ffmpeg.stdin.end();

      speaker.on('finish', () => {
        logger.info('Audio playback complete');
        resolve();
      });

      ffmpeg.on('error', (err) => {
        logger.error('ffmpeg error:', err.message);
        reject(err);
      });

      speaker.on('error', (err) => {
        logger.error('Speaker error:', err.message);
        reject(err);
      });
    } catch (err) {
      logger.error('Playback setup error:', err.message);
      reject(err);
    }
  });
}

/**
 * Full pipeline: record → transcribe → route intent → synthesize → play
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Result with transcript, intent, params, and speech
 */
export async function runFullPipeline(options = {}) {
  const {
    durationMs = 10000,
    whisperModel = 'base',
    groqSystemPrompt,
    voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
    play = true,
  } = options;

  try {
    // Step 1: Record audio
    logger.info('\n=== RECORDING ===');
    const pcmBuffer = await recordAudio(durationMs);

    // Step 2: Convert to WAV
    logger.info('Converting to WAV...');
    const wavBuffer = await pcmToWav(pcmBuffer);

    // Step 3: Transcribe with Whisper
    logger.info('\n=== TRANSCRIPTION ===');
    const transcript = await transcribeWithWhisper(wavBuffer, whisperModel);

    // Step 4: Route intent with Groq
    logger.info('\n=== INTENT ROUTING ===');
    const intentResult = await routeIntentWithGroq(transcript, groqSystemPrompt);

    logger.info(`Intent: ${intentResult.intent}`);
    logger.info(`Params: ${JSON.stringify(intentResult.params)}`);

    // For now, use the intent as-is (no mirror-server integration yet)
    const speech = intentResult.speech || `Handling ${intentResult.intent}`;

    // Step 5: Synthesize with ElevenLabs
    logger.info('\n=== TEXT-TO-SPEECH ===');
    const audioBuffer = await synthesizeWithElevenLabs(speech, voiceId);

    // Step 6: Play audio
    if (play) {
      logger.info('\n=== PLAYBACK ===');
      await playAudio(audioBuffer);
    }

    return {
      success: true,
      transcript,
      intent: intentResult.intent,
      params: intentResult.params,
      speech,
    };
  } catch (err) {
    logger.error(`Pipeline error: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Route text command (skip Whisper, useful for testing)
 * @param {string} command - Text command
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Result with intent, params, and speech
 */
export async function routeTextCommand(command, options = {}) {
  const { groqSystemPrompt, voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', play = true } = options;

  try {
    logger.info('\n=== TEXT ROUTING ===');
    logger.info(`Input: "${command}"`);

    // Route intent with Groq
    logger.info('\n=== INTENT ROUTING ===');
    const intentResult = await routeIntentWithGroq(command, groqSystemPrompt);

    logger.info(`Intent: ${intentResult.intent}`);
    logger.info(`Params: ${JSON.stringify(intentResult.params)}`);

    const speech = intentResult.speech || `Handling ${intentResult.intent}`;

    // Synthesize with ElevenLabs
    logger.info('\n=== TEXT-TO-SPEECH ===');
    const audioBuffer = await synthesizeWithElevenLabs(speech, voiceId);

    // Play audio
    if (play) {
      logger.info('\n=== PLAYBACK ===');
      await playAudio(audioBuffer);
    }

    return {
      success: true,
      command,
      intent: intentResult.intent,
      params: intentResult.params,
      speech,
    };
  } catch (err) {
    logger.error(`Text routing error: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
}
