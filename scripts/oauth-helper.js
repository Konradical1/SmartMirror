import fs from 'node:fs';
import http from 'node:http';

function loadEnvFile() {
  if (!fs.existsSync('.env')) return;

  const lines = fs.readFileSync('.env', 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const provider = process.argv[2];
const redirectUri = 'http://127.0.0.1:8888/callback';

const configs = {
  spotify: {
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    scope: 'user-read-currently-playing user-read-playback-state user-modify-playback-state',
    extraAuthParams: {},
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    extraAuthParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
};

if (!configs[provider]) {
  console.error('Usage: node scripts/oauth-helper.js spotify|google');
  process.exit(1);
}

const config = configs[provider];
if (!config.clientId || !config.clientSecret) {
  console.error(`Missing ${provider.toUpperCase()}_CLIENT_ID or ${provider.toUpperCase()}_CLIENT_SECRET in .env`);
  process.exit(1);
}

const authParams = new URLSearchParams({
  client_id: config.clientId,
  response_type: 'code',
  redirect_uri: redirectUri,
  scope: config.scope,
  ...config.extraAuthParams,
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);

  if (url.pathname !== '/callback') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    response.writeHead(400);
    response.end('Missing code');
    return;
  }

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(provider === 'spotify'
          ? {
              Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
            }
          : {}),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        ...(provider === 'google'
          ? {
              client_id: config.clientId,
              client_secret: config.clientSecret,
            }
          : {}),
      }),
    });

    const token = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(JSON.stringify(token));

    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Token created. You can close this tab and return to the terminal.');

    console.log('\nAdd this to .env:\n');
    console.log(`${provider.toUpperCase()}_REFRESH_TOKEN=${token.refresh_token}`);
    console.log('');
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end(error.message);
    console.error(error.message);
  } finally {
    server.close();
  }
});

server.listen(8888, '127.0.0.1', () => {
  console.log(`Listening for OAuth callback on ${redirectUri}`);
  console.log('\nOpen this URL in your browser:\n');
  console.log(`${config.authUrl}?${authParams.toString()}`);
  console.log('');
});
