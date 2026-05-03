import dotenv from 'dotenv';
import express from 'express';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleIntent } from './intentRouter.js';
import { attachWebSocket, broadcastOverlay, broadcastVoiceStatus } from './websocket.js';
import { refreshSpotify, startSpotifyPolling } from './handlers/spotify.js';
import { refreshCalendar } from './handlers/calendar.js';
import { refreshTodos } from './handlers/todo.js';
import { refreshWeather } from './handlers/weather.js';
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

app.post('/mirror-command', async (request, response) => {
  try {
    if (!validateSecret(request, process.env.ELEVENLABS_TOOL_SECRET)) {
      response.status(401).json({ ok: false, speech: 'Unauthorized.' });
      return;
    }

    const { intent, params, speech } = normalizeCommand(request.body);
    logger.info(`command ${intent}`, JSON.stringify(params));
    const result = await handleIntent(intent, params, speech);
    response.json({ ok: true, speech: result.speech, data: result.data ?? null });
  } catch (error) {
    logger.error(error.message);
    const failureSpeech = error.publicSpeech || 'Ah. That did not work. Shocking. Try again, sir.';
    broadcastOverlay(failureSpeech);
    response.status(error.status || 500).json({
      ok: false,
      speech: failureSpeech,
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
  const allowedStatuses = new Set(['idle', 'wake_detected', 'listening', 'thinking', 'speaking', 'error']);

  if (!allowedStatuses.has(status)) {
    response.status(400).json({ ok: false, error: 'Invalid voice status.' });
    return;
  }

  logger.info(`voice ${status}${text ? ` ${text}` : ''}`);
  broadcastVoiceStatus(status, text);
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
    if (request.path.startsWith('/mirror-command')) {
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
  refreshWeather({}).catch((error) => logger.error(error.message));
  refreshCalendar({}).catch((error) => logger.error(error.message));
  refreshSpotify().catch((error) => logger.error(error.message));
  refreshTodos().catch((error) => logger.error(error.message));

  setInterval(() => refreshWeather({}).catch((error) => logger.error(error.message)), 10 * 60 * 1000);
  setInterval(() => refreshCalendar({}).catch((error) => logger.error(error.message)), 5 * 60 * 1000);
  setInterval(() => refreshTodos().catch((error) => logger.error(error.message)), 60 * 1000);
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
