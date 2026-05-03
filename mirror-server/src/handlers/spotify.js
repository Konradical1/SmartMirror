import { getNowPlaying, runSpotifyCommand } from '../services/spotifyService.js';
import { setLastIntent, setScene, state, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';
import { logger } from '../utils/logger.js';

let spotifyPollTimer;

export async function refreshSpotify() {
  const spotify = await getNowPlaying();
  if (spotify) {
    updateContext('spotify', spotify);
    broadcastData({ spotify });
  }
  return spotify;
}

export function startSpotifyPolling() {
  scheduleSpotifyPoll(2500);
}

export async function handleSpotify(params = {}, speech = '') {
  const spotify = await refreshSpotify();
  setScene('spotify');
  setLastIntent('SHOW_SPOTIFY');
  const responseSpeech = spotify?.title ? `${spotify.title} by ${spotify.artist}, sir.` : 'Spotify is quiet right now, sir.';
  broadcastAction('SHOW_SPOTIFY', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { spotify } };
}

export async function handleSpotifyControl(intent, params = {}, speech = '') {
  await runSpotifyCommand(intent, params);
  setScene('spotify');
  setLastIntent(intent);
  const responseSpeech = controlSpeech(intent);
  broadcastAction(intent, {}, responseSpeech);
  setTimeout(() => refreshSpotify().catch((error) => logger.error(error.message)), 500);
  setTimeout(() => refreshSpotify().catch((error) => logger.error(error.message)), 1600);
  setTimeout(() => scheduleSpotifyPoll(2500), 1700);
  return { ok: true, speech: responseSpeech };
}

function scheduleSpotifyPoll(delayMs = nextSpotifyDelay()) {
  clearTimeout(spotifyPollTimer);
  spotifyPollTimer = setTimeout(async () => {
    try {
      await refreshSpotify();
    } catch (error) {
      logger.error(error.message);
    }
    scheduleSpotifyPoll();
  }, delayMs);
}

function nextSpotifyDelay() {
  const spotify = state.context.spotify;
  if (!spotify?.isPlaying || !spotify.durationMs || spotify.progressMs === undefined) return 5000;
  const liveProgressMs = Math.min(spotify.durationMs, spotify.progressMs + Math.max(0, Date.now() - (spotify.receivedAt || Date.now())));
  const remainingMs = spotify.durationMs - liveProgressMs;
  if (remainingMs <= 1000) return 700;
  if (remainingMs <= 5000) return 900;
  if (remainingMs <= 12000) return 1800;
  return 5000;
}

function controlSpeech(intent) {
  if (intent === 'SPOTIFY_NEXT') return 'Skipping ahead, sir.';
  if (intent === 'SPOTIFY_PREVIOUS') return 'Going back, sir.';
  if (intent === 'SPOTIFY_PAUSE') return 'Paused, sir.';
  if (intent === 'SPOTIFY_PLAY') return 'On it, sir.';
  return 'Done, sir.';
}
