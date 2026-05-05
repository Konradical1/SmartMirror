import dotenv from 'dotenv';
import express from 'express';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleIntent } from './intentRouter.js';
import { buildJarvisContext, buildNowContext } from './jarvis/context.js';
import {
  composeJarvisResponse,
  jarvisFailureSpeech,
  publicJarvisErrorMessage,
  runJarvisTurn,
} from './jarvis/pipeline.js';
import { attachWebSocket, broadcastAction, broadcastOverlay, broadcastVoiceStatus } from './websocket.js';
import { refreshSpotify, startSpotifyPolling } from './handlers/spotify.js';
import { refreshCalendar } from './handlers/calendar.js';
import { refreshTodos } from './handlers/todo.js';
import { refreshWeather } from './handlers/weather.js';
import { loadMemory, updateMemory } from './services/memoryService.js';
import { setLastIntent, setScene, state } from './state.js';
import { logger } from './utils/logger.js';
import { normalizeCommand, validateSecret } from './utils/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const port = Number(process.env.PORT || process.env.WS_PORT || 3001);
const app = express();
const server = http.createServer(app);
const distPath = path.resolve(__dirname, '../../dist');
let ngrokProcess = null;
let ngrokRetryTimer = null;

app.use(express.json({ limit: '256kb' }));

app.get('/health', (request, response) => {
  response.json({ ok: true, service: 'mirror-server' });
});

app.post('/jarvis-command', async (request, response) => {
  try {
    if (!validateSecret(request, process.env.ELEVENLABS_TOOL_SECRET)) {
      response.status(401).json({ ok: false, speech: 'Unauthorized.' });
      return;
    }

    const input = String(request.body?.input || request.body?.text || request.body?.transcript || '').trim();
    if (!input) {
      const message = 'No input text received.';
      response.status(400).json({
        ok: false,
        speech: `Jarvis response failed: ${message}`,
        error: message,
      });
      return;
    }

    const history = Array.isArray(request.body?.history) ? request.body.history : [];
    const result = await runJarvisTurn(input, { history, broadcast: true });
    response.json({
      ok: true,
      speech: result.speech,
      intent: result.intent,
      params: result.params,
      data: result.data ?? null,
      ui: result.ui ?? null,
      displayMs: result.displayMs,
      speechDisplayMs: result.speechDisplayMs,
    });
  } catch (error) {
    logger.error(error.message);
    const failureSpeech = error.publicSpeech || jarvisFailureSpeech(error);
    broadcastOverlay(failureSpeech);
    response.status(error.status || 500).json({
      ok: false,
      speech: failureSpeech,
      error: publicJarvisErrorMessage(error),
    });
  }
});

app.post('/mirror-command', async (request, response) => {
  try {
    if (!validateSecret(request, process.env.ELEVENLABS_TOOL_SECRET)) {
      response.status(401).json({ ok: false, speech: 'Unauthorized.' });
      return;
    }

    const { intent, params, speech } = normalizeCommand(request.body);
    logger.info(`command ${intent}`, JSON.stringify(params));
    const result = await handleIntent(intent, params);
    const route = { intent, params };
    const responseSpeech = await composeJarvisResponse({
      userInput: speech || request.body?.input || request.body?.transcript || intent,
      route,
      toolResult: result,
      context: buildContextSnapshot(),
      history: Array.isArray(request.body?.history) ? request.body.history : [],
    });
    broadcastOverlay(responseSpeech);
    response.json({ ok: true, speech: responseSpeech, data: result.data ?? null, ui: result.ui ?? null });
  } catch (error) {
    logger.error(error.message);
    const failureSpeech = error.publicSpeech || jarvisFailureSpeech(error);
    broadcastOverlay(failureSpeech);
    response.status(error.status || 500).json({
      ok: false,
      speech: failureSpeech,
      error: publicJarvisErrorMessage(error),
    });
  }
});

app.post('/mirror-command-data', async (request, response) => {
  try {
    if (!validateSecret(request, process.env.ELEVENLABS_TOOL_SECRET)) {
      response.status(401).json({ ok: false, error: 'Unauthorized.' });
      return;
    }

    const { intent, params } = normalizeCommand(request.body);
    logger.info(`data command ${intent}`, JSON.stringify(params));
    const result = await handleDataIntent(intent, params);
    response.json({
      ok: true,
      intent,
      data: result.data ?? null,
      ui: result.ui ?? null,
      context: buildContextSnapshot(),
    });
  } catch (error) {
    logger.error(error.message);
    response.status(error.status || 500).json({
      ok: false,
      error: error.publicMessage || error.message || 'Mirror data command failed.',
    });
  }
});

app.post('/mirror-context/refresh', async (request, response) => {
  try {
    if (!validateSecret(request, process.env.ELEVENLABS_TOOL_SECRET)) {
      response.status(401).json({ ok: false, error: 'Unauthorized.' });
      return;
    }

    const refreshed = await refreshMirrorContext();
    response.json({
      ok: true,
      refreshed,
      context: buildContextSnapshot(),
    });
  } catch (error) {
    logger.error(error.message);
    response.status(error.status || 500).json({
      ok: false,
      error: error.publicMessage || error.message || 'Mirror context refresh failed.',
      context: buildContextSnapshot(),
    });
  }
});

app.post('/voice-status', (request, response) => {
  if (!validateSecret(request, process.env.ELEVENLABS_TOOL_SECRET)) {
    response.status(401).json({ ok: false });
    return;
  }

  const status = typeof request.body?.status === 'string' ? request.body.status.trim().toLowerCase() : '';
  const text = typeof request.body?.text === 'string' ? request.body.text : '';
  const phase = typeof request.body?.phase === 'string' ? request.body.phase.trim().toLowerCase() : '';
  const source = typeof request.body?.source === 'string' ? request.body.source.trim().toLowerCase() : '';
  const final = Boolean(request.body?.final);
  const displayMs = Number(request.body?.displayMs);
  const allowedStatuses = new Set(['idle', 'wake_detected', 'listening', 'thinking', 'speaking', 'done', 'error']);

  if (!allowedStatuses.has(status)) {
    response.status(400).json({ ok: false, error: 'Invalid voice status.' });
    return;
  }

  logger.info(`voice ${status}${phase ? `/${phase}` : ''}${text ? ` ${text}` : ''}`);
  broadcastVoiceStatus(status, text, {
    phase,
    source,
    final,
    ...(Number.isFinite(displayMs) && displayMs > 0 ? { displayMs } : {}),
  });
  response.json({ ok: true });
});

app.get('/elevenlabs-signed-url', async (request, response) => {
  if (!validateSecret(request, process.env.ELEVENLABS_TOOL_SECRET)) {
    response.status(401).json({ ok: false });
    return;
  }

  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    response.status(500).json({
      ok: false,
      error: 'Set ELEVENLABS_AGENT_ID and ELEVENLABS_API_KEY before starting voice conversations.',
    });
    return;
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      },
    );

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !data.signed_url) {
      response.status(upstream.status || 502).json({
        ok: false,
        error: data.detail || data.error || 'Failed to get ElevenLabs signed URL.',
      });
      return;
    }

    response.json({ ok: true, signed_url: data.signed_url });
  } catch (error) {
    logger.error(`ElevenLabs signed URL failed: ${error.message}`);
    response.status(502).json({ ok: false, error: 'Failed to reach ElevenLabs.' });
  }
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    index: false,
    maxAge: '1h',
  }));

  app.get('*', (request, response, next) => {
    if (
      request.path.startsWith('/mirror-command')
      || request.path.startsWith('/jarvis-command')
      || request.path.startsWith('/mirror-context')
      || request.path.startsWith('/voice-status')
      || request.path.startsWith('/elevenlabs-signed-url')
      || request.path.startsWith('/health')
    ) {
      next();
      return;
    }

    response.sendFile(path.join(distPath, 'index.html'));
  });
}

attachWebSocket(server);

server.listen(port, '0.0.0.0', () => {
  logger.info(`HTTP + WebSocket listening on http://localhost:${port}`);
  warmContext();
  startSpotifyPolling();
  startNgrok(port);
});

function warmContext() {
  refreshMirrorContext().catch((error) => logger.error(error.message));

  setInterval(() => refreshWeather({}).catch((error) => logger.error(error.message)), 10 * 60 * 1000);
  setInterval(() => refreshCalendar({}).catch((error) => logger.error(error.message)), 5 * 60 * 1000);
  setInterval(() => refreshTodos().catch((error) => logger.error(error.message)), 60 * 1000);
}

async function handleDataIntent(intent, params = {}) {
  switch (intent) {
    case 'SHOW_WEATHER': {
      const weather = await refreshWeather(params);
      focusScene('weather', 'SHOW_WEATHER');
      broadcastAction('SHOW_WEATHER', {}, '');
      return { data: { weather }, ui: { scene: 'weather' } };
    }
    case 'SHOW_TIME': {
      setLastIntent('SHOW_TIME');
      return { data: { time: buildNowContext() }, ui: { scene: state.currentScene } };
    }
    case 'SHOW_CALENDAR': {
      const calendar = await refreshCalendar(params);
      focusScene('calendar', 'SHOW_CALENDAR');
      broadcastAction('SHOW_CALENDAR', {}, '');
      return { data: { calendar }, ui: { scene: 'calendar' } };
    }
    case 'SHOW_SPOTIFY': {
      const spotify = await refreshSpotify();
      focusScene('spotify', 'SHOW_SPOTIFY');
      broadcastAction('SHOW_SPOTIFY', {}, '');
      return { data: { spotify }, ui: { scene: 'spotify' } };
    }
    case 'SHOW_TODO':
    case 'SHOW_TODOS':
    case 'SHOW_TASKS': {
      const todos = await refreshTodos();
      focusScene('todo', 'SHOW_TODO');
      broadcastAction('SHOW_TODO', {}, '');
      return { data: { todos }, ui: { scene: 'todo' } };
    }
    case 'UPDATE_MEMORY':
    case 'REMEMBER': {
      const memory = await updateMemory(params);
      setLastIntent('UPDATE_MEMORY');
      return { data: { memory }, ui: { scene: state.currentScene } };
    }
    case 'SHOW_MEMORY': {
      const memory = await loadMemory();
      setLastIntent('SHOW_MEMORY');
      return { data: { memory }, ui: { scene: state.currentScene } };
    }
    case 'DISPLAY_MESSAGE': {
      setLastIntent('DISPLAY_MESSAGE');
      return { data: { message: params.message || params.text || '' }, ui: { scene: state.currentScene } };
    }
    case 'END_CONVERSATION': {
      setLastIntent('END_CONVERSATION');
      return { data: { ended: true }, ui: { scene: state.currentScene } };
    }
    case 'IDLE': {
      focusScene('idle', 'IDLE');
      broadcastAction('IDLE', {}, '');
      return { data: {}, ui: { scene: 'idle' } };
    }
    default: {
      const result = await handleIntent(intent, params);
      return { data: result.data ?? null, ui: { scene: state.currentScene } };
    }
  }
}

function focusScene(scene, intent) {
  setScene(scene);
  setLastIntent(intent);
}

async function refreshMirrorContext() {
  const tasks = {
    weather: () => refreshWeather({}),
    calendar: () => refreshCalendar({}),
    spotify: () => refreshSpotify(),
    todos: () => refreshTodos(),
    memory: () => loadMemory(),
  };

  const entries = await Promise.all(Object.entries(tasks).map(async ([key, task]) => {
    try {
      await task();
      return [key, { ok: true }];
    } catch (error) {
      logger.error(`${key} refresh failed: ${error.message}`);
      return [key, { ok: false, error: error.message }];
    }
  }));

  return Object.fromEntries(entries);
}

function buildContextSnapshot() {
  return buildJarvisContext();
}

async function startNgrok(addr, attempt = 0) {
  const MAX_ATTEMPTS = 10;
  const RETRY_DELAY = 20000;

  if (!process.env.NGROK_AUTHTOKEN) {
    logger.info('Ngrok disabled. Set NGROK_AUTHTOKEN when you are ready to expose /mirror-command to ElevenLabs.');
    return;
  }

  function retry(reason) {
    if (ngrokRetryTimer) return;
    if (attempt < MAX_ATTEMPTS) {
      logger.warn(`${reason} ? retrying in ${RETRY_DELAY / 1000}s (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
      ngrokRetryTimer = setTimeout(() => {
        ngrokRetryTimer = null;
        startNgrok(addr, attempt + 1);
      }, RETRY_DELAY);
    } else {
      logger.error('Ngrok max retries reached. ElevenLabs integration unavailable until next restart.');
    }
  }

  if (ngrokProcess && ngrokProcess.exitCode === null) {
    logger.warn('Ngrok start skipped because a tunnel process is already running.');
    return;
  }

  try {
    const ngrokPath = resolveNgrokBinary();
    if (attempt === 0) {
      logger.info(`Using ngrok binary: ${ngrokPath}`);
      logger.info(`Using ngrok version: ${ngrokVersion(ngrokPath)}`);
    }

    let tunnelUp = false;

    const child = spawn(
      ngrokPath,
      ['http', String(addr), '--authtoken', process.env.NGROK_AUTHTOKEN, '--log', 'stdout', '--log-format', 'json'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    ngrokProcess = child;

    child.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logger.info(`ngrok: ${text}`);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logger.error(`ngrok: ${text}`);
    });

    child.on('exit', (code) => {
      if (ngrokProcess === child) ngrokProcess = null;
      if (tunnelUp) {
        retry(`ngrok exited with code ${code}`);
      } else {
        retry(`ngrok exited before tunnel was ready with code ${code}`);
      }
    });

    child.on('error', (error) => {
      logger.error(`ngrok process failed: ${error.message}`);
    });

    const url = await waitForNgrokUrl();
    tunnelUp = true;
    logger.info(`Ngrok tunnel: ${url}`);
    logger.info(`ElevenLabs tool URL: ${url}/mirror-command`);
  } catch (error) {
    logger.error(`Ngrok failed: ${error.message}`);
    retry(error.message);
  }
}

function resolveNgrokBinary() {
  const candidates = [
    process.env.NGROK_BIN,
    process.platform === 'win32' && path.resolve(__dirname, '../node_modules/ngrok/bin/ngrok.exe'),
    '/opt/homebrew/bin/ngrok',
    '/usr/local/bin/ngrok',
    resolvePathCommand('ngrok'),
    path.resolve(__dirname, '../node_modules/ngrok/bin/ngrok'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (process.platform === 'win32' && candidate.endsWith('.cmd')) continue;
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('Could not find an ngrok binary. Re-run npm --prefix mirror-server install or set NGROK_BIN.');
}

function resolvePathCommand(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], { encoding: 'utf8' });
  const output = result.stdout || result.stderr || '';
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function ngrokVersion(binary) {
  const result = spawnSync(binary, ['version'], { encoding: 'utf8' });
  return (result.stdout || result.stderr || result.error?.message || 'unknown').trim();
}

async function waitForNgrokUrl() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4040/api/tunnels');
      if (response.ok) {
        const data = await response.json();
        const tunnel = data.tunnels?.find((item) => item.public_url?.startsWith('https://'));
        if (tunnel?.public_url) return tunnel.public_url;
      }
    } catch {
      // ngrok API is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timed out waiting for ngrok tunnel URL.');
}
