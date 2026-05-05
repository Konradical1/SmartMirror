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
  speakWithTtsProvider,
  transcribeAudio,
  transcriptIsUsable,
  waitForWakeWordUtterance,
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
const verbose = args.includes('--verbose');
const textFlag = readFlag('--text');
const textCommand = textFlag.value;
const useLocal = args.includes('--local');
const wakeEnabled = mode === 'voice' && !args.includes('--no-wake');
const mirrorBaseUrl = (readFlag('--mirror-base-url').value || process.env.MIRROR_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const mirrorSecret = process.env.ELEVENLABS_TOOL_SECRET || '';
const ttsProvider = String(readFlag('--tts').value || process.env.TTS_PROVIDER || process.env.VOICE_TTS_PROVIDER || 'elevenlabs').toLowerCase();
const voiceId = readFlag('--voice-id').value || (
  ttsProvider === 'inworld'
    ? process.env.INWORLD_VOICE_ID || 'Dennis'
    : process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
);
const recordMs = Number(readFlag('--record-ms').value || process.env.VOICE_CHAT_RECORD_MS || process.env.VOICE_RECORD_MS || 6500);
const silenceFrames = Number(readFlag('--silence-frames').value || process.env.VOICE_CHAT_SILENCE_FRAMES || process.env.VOICE_SILENCE_FRAMES || 8);
const conversationSilenceMs = Number(readFlag('--conversation-silence-ms').value || process.env.VOICE_CONVERSATION_SILENCE_MS || 5000);
const sttProvider = readFlag('--stt').value || process.env.STT_PROVIDER || 'elevenlabs';
const sttModel = readFlag('--stt-model').value || process.env.ELEVENLABS_STT_MODEL || process.env.STT_MODEL || 'scribe_v2';
const interruptWakeThreshold = Number(readFlag('--interrupt-wake-threshold').value || process.env.VOICE_INTERRUPT_WAKE_THRESHOLD || 0.65);
const wakePrompt = String(process.env.VOICE_WAKE_PROMPT || randomWakePrompt()).trim();
const contextRefreshMode = String(
  readFlag('--context-refresh').value
  || process.env.VOICE_CONTEXT_REFRESH_MODE
  || (process.env.VOICE_REFRESH_CONTEXT === 'false' ? 'false' : 'background'),
).toLowerCase();
const contextRefreshCooldownMs = Number(process.env.VOICE_CONTEXT_REFRESH_COOLDOWN_MS || 60000);

const config = llmConfig(activeLlmProvider());
let contextRefreshPromise = null;
let contextRefreshedAt = 0;

if (mode === 'voice' && !verbose) {
  logger.info = () => {};
}

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

function randomWakePrompt() {
  const options = [
    'Yes, Konrad?',
    'Oh good. What now?',
    'I am listening. A bold development.',
    'Yes?',
    'You rang. Dramatically.',
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function printHeader() {
  console.log('\nJARVIS Test Runner');
  console.log('------------------');
  console.log(`LLM      ${config.name} (${config.model})`);
  console.log(`Mode     ${mode}`);
  console.log(`Runner   ${useLocal ? 'local pipeline' : mirrorBaseUrl}`);
  if (mode === 'voice') {
    console.log(`STT      ${sttProvider} (${sttModel})`);
    console.log(`TTS      ${noPlay ? 'disabled' : `${ttsProvider} ${voiceId}`}`);
    console.log(`Wake     ${wakeEnabled ? 'enabled' : 'disabled'}`);
    console.log(`Silence  ${conversationSilenceMs}ms`);
    console.log(`Context  ${contextRefreshMode}${contextRefreshMode !== 'false' ? ` (${contextRefreshCooldownMs}ms cooldown)` : ''}`);
    console.log(`Logs     ${verbose ? 'verbose service logs' : 'clean timeline'}`);
  }
  console.log('');
}

function validateEnv() {
  if (!config.apiKey) throw new Error(`${config.apiKeyName} not set.`);
  if (mode === 'voice' && ['elevenlabs', 'scribe'].includes(sttProvider) && !process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set for ElevenLabs STT.');
  }
  if (mode === 'voice' && !noPlay && ttsProvider === 'elevenlabs' && !process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set for ElevenLabs TTS.');
  }
  if (mode === 'voice' && !noPlay && ttsProvider === 'inworld' && !process.env.INWORLD_API_KEY) {
    throw new Error('INWORLD_API_KEY not set for Inworld TTS.');
  }
}

async function runTextMode() {
  let history = [];

  if (textCommand) {
    const result = await handleInputSafely(textCommand, history);
    printResult(result);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const input = await ask(rl, 'You: ');
    if (!input.trim()) continue;
    if (shouldStop(input)) break;
    const result = await handleInputSafely(input, history);
    if (result.ok) history = appendHistory(history, input, result.speech);
    printResult(result);
    if (once) break;
  }
  rl.close();
}

async function runVoiceMode() {
  const session = createTimeline('session');
  session.mark('voice.ready', `${wakeEnabled ? 'wake-word' : 'continuous'} mode`);

  await scheduleContextRefresh('startup', session);

  while (true) {
    if (wakeEnabled) {
      session.mark('wake.wait');
      await postVoiceStatus('idle', 'Wake listener ready');
      const wakeTurn = await waitForWakeWordUtterance({
        onWake: () => {
          session.mark('wake.detected', 'Jarvis');
          postVoiceStatus('wake_detected', 'Jarvis');
        },
      });
      session.mark('wake.capture.done', formatBytes(wakeTurn.pcm?.length || 0));
      await scheduleContextRefresh('wake', session);
      await runVoiceConversation({ initialPcm: wakeTurn.pcm });
    } else {
      await scheduleContextRefresh('session', session);
      await runVoiceConversation();
    }
    if (once || !wakeEnabled) break;
    session.mark('conversation.closed', 'returning to wake');
  }
}

async function runVoiceConversation({ initialPcm = null } = {}) {
  let history = [];
  let silenceStartedAt = null;
  let queuedTurn = initialPcm?.length ? { pcm: initialPcm, source: 'wake' } : null;
  let turnCount = 0;

  while (true) {
    const turn = createTimeline(`turn ${++turnCount}`);
    let pcm = null;
    let queuedSource = '';
    let echoReference = '';
    if (queuedTurn?.pcm?.length) {
      pcm = queuedTurn.pcm;
      queuedSource = queuedTurn.source || '';
      echoReference = queuedTurn.echoReference || '';
      queuedTurn = null;
      turn.mark('audio.ready', `${queuedSource || 'queued'} ${formatBytes(pcm.length)}`);
    } else {
      turn.mark('listen.start', `${recordMs}ms max`);
      await postVoiceStatus('listening', '');
      turn.mark('ui.listening');
      pcm = await recordAudioWithOptions(recordMs, { silenceFrames });
      turn.mark('audio.captured', formatBytes(pcm?.length || 0));
    }

    turn.mark('stt.start', `${sttProvider} ${sttModel}`);
    const transcriptResult = await transcribePcm(pcm);
    turn.mark('stt.done', transcriptResult.source || sttProvider);

    const rawTranscript = String(transcriptResult.text || '').trim();
    const transcript = wakeEnabled ? stripWakeInvocation(rawTranscript) : rawTranscript;
    if (transcript) {
      await postVoiceStatus('listening', transcript, {
        phase: 'final',
        source: transcriptResult.source || sttProvider,
        final: true,
      });
      turn.mark('ui.transcript.final', quote(transcript));
    }
    if (wakeEnabled && rawTranscript && !transcript) {
      turn.mark('wake.only', quote(rawTranscript));
      if (wakePrompt) {
        await postVoiceStatus('speaking', wakePrompt, { displayMs: wakePromptDisplayMs(wakePrompt) });
        turn.mark('ui.speaking', quote(wakePrompt));
        if (!noPlay) {
          const playback = await speakJarvisResponse(wakePrompt, turn);
          if (playback?.interrupted) {
            queuedTurn = {
              pcm: playback.pcm,
              source: 'interrupt',
              echoReference: wakePrompt,
            };
            silenceStartedAt = null;
            continue;
          }
        }
      }
      if (once) return;
      silenceStartedAt = null;
      continue;
    }
    if (queuedSource === 'interrupt' && isLikelySpeakerEcho(transcript, echoReference)) {
      turn.mark('echo.ignored', quote(transcript));
      continue;
    }
    if (!transcript || !transcriptIsUsable({ ...transcriptResult, text: transcript })) {
      turn.mark('stt.empty', 'no usable speech');
      if (once) return;
      silenceStartedAt ||= Date.now();
      if (Date.now() - silenceStartedAt >= conversationSilenceMs) {
        turn.mark('silence.limit', `${conversationSilenceMs}ms`);
        await postVoiceStatus('done', 'Done');
        turn.mark('ui.done');
        return;
      }
      continue;
    }

    silenceStartedAt = null;
    turn.line(`You    ${transcript}${rawTranscript !== transcript ? ` (from "${rawTranscript}")` : ''}`);
    await postVoiceStatus('thinking', transcript);
    turn.mark('ui.thinking');
    turn.mark('jarvis.start');
    const result = await handleInputSafely(transcript, history);
    turn.mark('jarvis.done', `${result.intent}${result.error ? ' error' : ''}`);
    if (result.ok) history = appendHistory(history, transcript, result.speech);
    printResult(result, turn);
    if (result.ok && result.speech) {
      await postVoiceStatus('speaking', result.speech, {
        displayMs: result.speechDisplayMs || result.ui?.speechDisplayMs || result.displayMs,
      });
      turn.mark('ui.speaking');
    }
    if (!noPlay && result.ok && result.speech) {
      const playback = await speakJarvisResponse(result.speech, turn);
      if (playback.interrupted) {
        queuedTurn = {
          pcm: playback.pcm,
          source: 'interrupt',
          echoReference: result.speech,
        };
        silenceStartedAt = null;
        continue;
      }
    }
    if (result.intent === 'END_CONVERSATION' || shouldStopConversation(transcript)) {
      await postVoiceStatus('done', result.speech || 'Done');
      turn.mark('ui.done');
      turn.done();
      return;
    }
    turn.done();
    if (once) return;
  }
}

async function speakJarvisResponse(speech, timeline = createTimeline('tts')) {
  timeline.mark('tts.start', `${ttsProvider} ${voiceId}`);
  if (!wakeEnabled) {
    await speakWithTtsProvider(speech, {
      play: true,
      provider: ttsProvider,
      voiceId,
    });
    timeline.mark('tts.done');
    return { interrupted: false };
  }

  const playbackController = new AbortController();
  const wakeController = new AbortController();
  let wakeDetected = false;

  const wakePromise = waitForWakeWordUtterance({
    signal: wakeController.signal,
    threshold: interruptWakeThreshold,
    preRollMs: Number(process.env.VOICE_INTERRUPT_PRE_ROLL_MS || 250),
    maxCaptureMs: Number(process.env.VOICE_INTERRUPT_UTTERANCE_MAX_MS || process.env.VOICE_WAKE_UTTERANCE_MAX_MS || 6500),
    minCaptureMs: Number(process.env.VOICE_INTERRUPT_UTTERANCE_MIN_MS || 500),
    silenceMs: Number(process.env.VOICE_INTERRUPT_SILENCE_MS || process.env.VOICE_WAKE_UTTERANCE_SILENCE_MS || 850),
    onWake: () => {
      wakeDetected = true;
      playbackController.abort();
      timeline.mark('tts.interrupted', 'wake detected');
      postVoiceStatus('wake_detected', 'Jarvis');
    },
  }).then(
    (turn) => ({ ok: true, turn }),
    (error) => ({ ok: false, error }),
  );

  try {
    const playback = await speakWithTtsProvider(speech, {
      play: true,
      provider: ttsProvider,
      signal: playbackController.signal,
      voiceId,
    });

    if (!wakeDetected && !playback?.interrupted) {
      wakeController.abort();
      await wakePromise;
      timeline.mark('tts.done');
      return { interrupted: false };
    }
  } catch (error) {
    if (!playbackController.signal.aborted) throw error;
  }

  const wakeResult = await wakePromise;
  if (!wakeResult.ok) {
    logger.warn(`Wake interruption failed: ${wakeResult.error?.message || wakeResult.error}`);
    return { interrupted: true, pcm: null };
  }

  timeline.mark('interrupt.capture.done', formatBytes(wakeResult.turn.pcm?.length || 0));
  return {
    interrupted: true,
    pcm: wakeResult.turn.pcm,
  };
}

async function transcribePcm(pcm) {
  const wav = await pcmToWav(pcm);
  return transcribeAudio(wav, {
    provider: sttProvider,
    sttModel,
    elevenLabsSttModel: sttModel,
  });
}

function wakePromptDisplayMs(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const base = 1400 + words * 360;
  return Math.min(8000, Math.max(3200, base));
}

async function postVoiceStatus(status, text = '', meta = {}) {
  try {
    await fetch(`${mirrorBaseUrl}/voice-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(mirrorSecret ? { 'X-Mirror-Secret': mirrorSecret } : {}),
      },
      body: JSON.stringify({ status, text, ...meta }),
    });
  } catch (error) {
    logger.warn(`voice-status update failed: ${error.message}`);
  }
}

async function scheduleContextRefresh(reason = '', timeline = null) {
  if (contextRefreshMode === 'false' || contextRefreshMode === 'off' || contextRefreshMode === 'none') {
    return;
  }

  const now = Date.now();
  if (contextRefreshPromise) {
    timeline?.mark('context.refresh.skip', 'already running');
    if (contextRefreshMode === 'blocking') await contextRefreshPromise;
    return;
  }

  if (contextRefreshedAt && now - contextRefreshedAt < contextRefreshCooldownMs) {
    timeline?.mark('context.refresh.skip', `${Math.round(now - contextRefreshedAt)}ms old`);
    return;
  }

  timeline?.mark(
    contextRefreshMode === 'blocking' ? 'context.refresh.start' : 'context.refresh.background',
    reason,
  );

  contextRefreshPromise = refreshMirrorContext(reason)
    .then((refreshed) => {
      contextRefreshedAt = Date.now();
      timeline?.mark('context.refresh.done', summarizeRefresh(refreshed));
      return refreshed;
    })
    .catch((error) => {
      timeline?.mark('context.refresh.error', runnerErrorMessage(error));
      return null;
    })
    .finally(() => {
      contextRefreshPromise = null;
    });

  if (contextRefreshMode === 'blocking') {
    await contextRefreshPromise;
  }
}

async function refreshMirrorContext(reason = '') {
  if (useLocal) return;
  const response = await fetch(`${mirrorBaseUrl}/mirror-context/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mirrorSecret ? { 'X-Mirror-Secret': mirrorSecret } : {}),
    },
  });

  const responseText = await response.text();
  const payload = parseJsonResponse(responseText) || {};
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || responseText || `HTTP ${response.status} ${response.statusText}`);
  }
  return payload.refreshed || {};
}

async function handleInputSafely(input, history) {
  try {
    return await handleInput(input, history);
  } catch (error) {
    const message = runnerErrorMessage(error);
    return {
      ok: false,
      input,
      intent: 'ERROR',
      params: {},
      data: null,
      ui: null,
      speech: `Jarvis command failed: ${message}`,
      error: message,
    };
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

  const responseText = await response.text();
  const payload = parseJsonResponse(responseText) || {
    ok: false,
    speech: `Jarvis command failed: HTTP ${response.status}`,
    error: responseText || response.statusText,
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.speech || `HTTP ${response.status} ${response.statusText}`);
  }

  return {
    ok: true,
    input,
    intent: payload.intent,
    params: payload.params || {},
    data: payload.data ?? null,
    ui: payload.ui ?? null,
    displayMs: payload.displayMs,
    speechDisplayMs: payload.speechDisplayMs || payload.ui?.speechDisplayMs,
    speech: payload.speech,
  };
}

function printResult(result, timeline = null) {
  const lines = [
    `Intent ${result.intent}`,
    `Params ${JSON.stringify(result.params)}`,
    ...(result.error ? [`Error  ${result.error}`] : []),
    `Jarvis ${result.speech}`,
  ];

  if (timeline) {
    lines.forEach((line) => timeline.line(line));
    return;
  }

  lines.forEach((line) => console.log(line));
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function createTimeline(label) {
  const startedAt = performance.now();
  let lastAt = startedAt;

  console.log(`\n[${label}]`);

  return {
    mark(event, detail = '') {
      const now = performance.now();
      const total = Math.round(now - startedAt);
      const delta = Math.round(now - lastAt);
      lastAt = now;
      console.log(`${formatMs(total)}  +${formatMs(delta)}  ${event}${detail ? `  ${detail}` : ''}`);
    },
    line(text) {
      console.log(`                 ${text}`);
    },
    done() {
      const total = Math.round(performance.now() - startedAt);
      console.log(`${formatMs(total)}           turn.done`);
    },
  };
}

function formatMs(value) {
  const ms = Math.max(0, Number(value) || 0);
  if (ms < 1000) return `${String(ms).padStart(4, ' ')}ms`;
  return `${(ms / 1000).toFixed(2).padStart(5, ' ')}s`;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function quote(text, maxLength = 96) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const clipped = value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
  return `"${clipped}"`;
}

function summarizeRefresh(refreshed = {}) {
  const entries = Object.entries(refreshed);
  if (!entries.length) return '';
  const failed = entries.filter(([, value]) => value?.ok === false).map(([key]) => key);
  if (failed.length) return `failed: ${failed.join(', ')}`;
  return entries.map(([key]) => key).join(', ');
}

function shouldStop(text) {
  return /^(stop listening|stop|quit|exit|goodbye|bye)$/i.test(String(text).trim());
}

function shouldStopConversation(text) {
  const value = normalizeCommandText(text);
  return shouldStop(value)
    || /\b(goodbye|bye|done with you|that'?s all|that is all|all set|we'?re done|we are done|you can stop|stop conversation)\b/.test(value)
    || /\b(i am|i'm|im)\s+good(?:\s+now)?\b/.test(value);
}

function stopSpeech(text) {
  const value = normalizeCommandText(text);
  if (/goodbye|bye/.test(value)) return 'Goodbye, sir.';
  return 'Done, sir.';
}

function stripWakeInvocation(text) {
  return String(text || '')
    .replace(/^\s*(?:(?:hey|hi|hello|okay|ok)[\s,]+)?jarvis\b[\s,.:;-]*/i, '')
    .trim();
}

function isLikelySpeakerEcho(transcript, spokenText) {
  const transcriptTokens = meaningfulTokens(transcript);
  const spokenTokens = new Set(meaningfulTokens(spokenText));
  if (transcriptTokens.length < 5 || spokenTokens.size < 5) return false;

  const overlap = transcriptTokens.filter((token) => spokenTokens.has(token)).length / transcriptTokens.length;
  return overlap >= 0.72;
}

function meaningfulTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !['the', 'and', 'you', 'your', 'sir', 'jarvis'].includes(token));
}

function normalizeCommandText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function runnerErrorMessage(error) {
  const message = cleanErrorText(error?.message || error || 'unknown error') || 'unknown error';
  const cause = error?.cause;
  const endpoint = cause?.address && cause?.port ? `${cause.address}:${cause.port}` : '';
  const code = cleanErrorText(cause?.code);
  const transportDetails = [code, endpoint].filter(Boolean).join(' ');
  if (transportDetails) return `${message} (${transportDetails})`;

  const causeMessage = cleanErrorText(cause?.message);
  return causeMessage && causeMessage !== message ? `${message} (${causeMessage})` : message;
}

function parseJsonResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanErrorText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}
