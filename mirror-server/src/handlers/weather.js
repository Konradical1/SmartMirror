import { getWeather } from '../services/weatherService.js';
import { setLastIntent, setScene, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';

export async function handleWeather(params = {}, speech = '') {
  const weather = await refreshWeather(params);
  setScene('weather');
  setLastIntent('SHOW_WEATHER');
  const responseSpeech = weatherSpeech(weather);
  broadcastAction('SHOW_WEATHER', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { weather } };
}

export async function refreshWeather(params = {}) {
  const weather = await getWeather(params);
  updateContext('weather', weather);
  broadcastData({ weather });
  return weather;
}

function weatherSpeech(weather) {
  return `${weather.temperature} degrees and ${weather.condition.toLowerCase()} in ${weather.location}, sir. Feels like ${weather.feelsLike}.`;
}
