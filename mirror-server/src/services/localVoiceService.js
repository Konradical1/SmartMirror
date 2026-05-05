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
  return recordAudioWithOptions(durationMs, {});
}

/**
 * Record audio from microphone with explicit options.
 * @param {number} durationMs - Maximum duration in milliseconds
 * @param {Object} options - Recording options
 * @returns {Promise<Buffer>} Raw PCM audio buffer
 */
export async function recordAudioWithOptions(durationMs = 10000, options = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const sampleRate = 16000;
    const channels = 1;
    const bitDepth = 16;
    const recordMs = Number(options.recordMs ?? process.env.VOICE_RECORD_MS ?? durationMs);
    const silenceFrames = Number(options.silenceFrames ?? process.env.VOICE_SILENCE_FRAMES ?? 4);

    logger.info('Starting microphone recording...');

    const homebrewRec = '/opt/homebrew/bin/rec';
    const intelRec = '/usr/local/bin/rec';
    const recPrefix = fs.existsSync(homebrewRec) ? '/opt/homebrew/bin' : fs.existsSync(intelRec) ? '/usr/local/bin' : null;
    if (recPrefix && !process.env.PATH?.includes(recPrefix)) {
      process.env.PATH = `${recPrefix}:${process.env.PATH || ''}`;
    }

    const micInstance = new Mic({
      rate: sampleRate,
      channels,
      exitOnSilence: Number.isFinite(silenceFrames) ? silenceFrames : 0,
      debug: false,
      device: options.device || process.env.AUDIO_DEVICE || undefined,
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

    micStream.on('silence', () => {
      if (silenceFrames > 0) {
        micInstance.stop();
      }
    });

    micInstance.start();

    const timeout = setTimeout(() => {
      micInstance.stop();
    }, recordMs);

    micStream.on('end', () => {
      clearTimeout(timeout);
      const audioBuffer = Buffer.concat(chunks);
      logger.info(`Recording complete: ${audioBuffer.length} bytes`);
      resolve(audioBuffer);
    });
  });
}

/**
 * Transcribe audio using ElevenLabs Scribe batch STT.
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {string} model - ElevenLabs STT model
 * @returns {Promise<Object>} Transcription result
 */
export async function transcribeWithElevenLabs(audioBuffer, model = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2') {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set in environment');
  }

  logger.info(`Transcribing with ElevenLabs STT (${model})...`);

  const formData = new FormData();
  formData.append('model_id', model);
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');

  const language = process.env.STT_LANGUAGE || process.env.ELEVENLABS_STT_LANGUAGE || 'en';
  if (language) {
    formData.append('language_code', language);
  }

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs STT error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const transcript = normalizeTranscriptText(result.text);
  logger.info(`Transcript: "${transcript}"`);

  return {
    text: transcript,
    source: 'elevenlabs',
    noSpeechProb: transcript ? 0 : 1,
    avgLogprob: 0,
    words: result.words || [],
    raw: result,
  };
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

      const venvWhisper = path.resolve(__dirname, '../../.venv-voice/bin/whisper');
      const envWhisper = process.env.WHISPER_BIN?.trim();
      let whisperBin = null;

      if (envWhisper && fs.existsSync(envWhisper)) {
        whisperBin = envWhisper;
      } else if (fs.existsSync(venvWhisper)) {
        whisperBin = venvWhisper;
      } else {
        const whichResult = spawnSync('which', ['whisper'], { encoding: 'utf-8' });
        if (whichResult.status === 0) {
          whisperBin = 'whisper';
        }
      }

      if (!whisperBin) {
        fs.unlinkSync(tempFile);
        throw new Error('Whisper CLI not found. Install openai-whisper in .venv-voice or set WHISPER_BIN.');
      }

      // Call whisper via subprocess
      const whisper = spawn(whisperBin, [tempFile, '--model', model, '--output_format', 'json', '--output_dir', tempDir, '--language', 'en', '--no_speech_threshold', '0.6'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisper.on('error', (err) => {
        fs.unlinkSync(tempFile);
        logger.error('Whisper spawn error:', err.message);
        reject(err);
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

function normalizeTranscriptText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function shouldIgnoreTranscript(result) {
  const text = normalizeTranscriptText(result?.text);
  if (!text) {
    return true;
  }

  if (/^[\s\.,!?-]+$/.test(text)) {
    return true;
  }

  const wordCount = text.split(' ').filter(Boolean).length;
  if (wordCount <= 1 && text.length <= 2) {
    return true;
  }

  const noSpeechProb = Number(result?.noSpeechProb);
  const avgLogprob = Number(result?.avgLogprob);

  if (Number.isFinite(noSpeechProb) && noSpeechProb > 0.7) {
    return true;
  }

  if (Number.isFinite(avgLogprob) && avgLogprob < -1.0 && wordCount <= 4) {
    return true;
  }

  return false;
}

/**
 * Transcribe audio using the configured provider.
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {Object} options - Transcription options
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioBuffer, options = {}) {
  const provider = (options.provider || process.env.STT_PROVIDER || 'elevenlabs').toLowerCase();
  const model = options.sttModel || process.env.STT_MODEL || 'whisper-large-v3-turbo';

  if (provider === 'whisper' || provider === 'local-whisper') {
    return { text: await transcribeWithWhisper(audioBuffer, model), source: 'whisper' };
  }

  if (provider === 'elevenlabs' || provider === 'scribe') {
    const elevenLabsModel = options.elevenLabsSttModel
      || process.env.ELEVENLABS_STT_MODEL
      || (options.sttModel && !/^whisper/i.test(options.sttModel) ? options.sttModel : null)
      || 'scribe_v2';
    return transcribeWithElevenLabs(audioBuffer, elevenLabsModel);
  }

  logger.warn(`Unknown STT provider "${provider}", falling back to local Whisper.`);
  return { text: await transcribeWithWhisper(audioBuffer, process.env.WHISPER_MODEL || 'tiny.en'), source: 'whisper' };
}

/**
 * Determine whether a transcript should be ignored for conversational voice turns.
 * @param {Object} result - Transcript result
 * @returns {boolean}
 */
export function transcriptIsUsable(result) {
  return !shouldIgnoreTranscript(result);
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
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4&output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1',
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
 * Stream ElevenLabs audio directly to the speaker for lower latency.
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {Object} options - Options
 * @returns {Promise<Buffer|void>} Audio buffer if play is false, otherwise void
 */
export async function speakWithElevenLabs(text, voiceId, options = {}) {
  const { play = true } = options;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set in environment');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4&output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1',
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

  if (!play) {
    return Buffer.from(await response.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    try {
      logger.info('Playing streaming audio...');

      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
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

      const audioStream = response.body;
      if (!audioStream) {
        reject(new Error('ElevenLabs response body missing'));
        return;
      }

      let settled = false;
      const settle = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        if (err) {
          reject(err);
          return;
        }
        resolve();
      };

      audioStream.on('error', (err) => {
        logger.error('ElevenLabs stream error:', err.message);
        settle(err);
      });

      audioStream.pipe(ffmpeg.stdin);
      ffmpeg.stdout.pipe(speaker);

      ffmpeg.on('error', (err) => {
        logger.error('ffmpeg error:', err.message);
        settle(err);
      });

      speaker.on('error', (err) => {
        logger.error('Speaker error:', err.message);
        settle(err);
      });

      speaker.on('finish', () => settle());
      speaker.on('close', () => settle());
    } catch (err) {
      logger.error('Streaming playback setup error:', err.message);
      reject(err);
    }
  });
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
