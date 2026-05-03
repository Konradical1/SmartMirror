import {
  handleAddCalendarEvent,
  handleCalendar,
  handleDeleteCalendarEvent,
  handleEditCalendarEvent,
} from './handlers/calendar.js';
import { handleEmail } from './handlers/email.js';
import { handleSpotify, handleSpotifyControl } from './handlers/spotify.js';
import { handleAddTodo, handleCheckTodo, handleTodo } from './handlers/todo.js';
import { handleWeather } from './handlers/weather.js';
import { setLastIntent, setScene } from './state.js';
import { broadcastAction, broadcastOverlay } from './websocket.js';

export async function handleIntent(intent, params = {}, speech = '') {
  switch (intent) {
    case 'SHOW_WEATHER':
      return handleWeather(params, speech);
    case 'SHOW_CALENDAR':
      return handleCalendar(params, speech);
    case 'ADD_CALENDAR_EVENT':
    case 'ADD_CALENDAR':
    case 'CREATE_CALENDAR_EVENT':
    case 'CREATE_EVENT':
      return handleAddCalendarEvent(params, speech);
    case 'EDIT_CALENDAR_EVENT':
    case 'EDIT_CALENDAR':
    case 'UPDATE_CALENDAR_EVENT':
    case 'UPDATE_EVENT':
      return handleEditCalendarEvent(params, speech);
    case 'DELETE_CALENDAR_EVENT':
    case 'DELETE_CALENDAR':
    case 'REMOVE_CALENDAR_EVENT':
    case 'REMOVE_EVENT':
      return handleDeleteCalendarEvent(params, speech);
    case 'SHOW_SPOTIFY':
      return handleSpotify(params, speech);
    case 'SPOTIFY_NEXT':
    case 'SPOTIFY_PREVIOUS':
    case 'SPOTIFY_PAUSE':
    case 'SPOTIFY_PLAY':
      return handleSpotifyControl(intent, params, speech);
    case 'SHOW_TODO':
      return handleTodo(params, speech);
    case 'ADD_TODO':
      return handleAddTodo(params, speech);
    case 'CHECK_TODO':
      return handleCheckTodo(params, speech);
    case 'SHOW_EMAIL':
      return handleEmail(params, speech);
    case 'DISPLAY_MESSAGE':
      setLastIntent('DISPLAY_MESSAGE');
      broadcastOverlay(speech || '');
      return { ok: true, speech: speech || '' };
    case 'IDLE':
      setScene('idle');
      setLastIntent('IDLE');
      broadcastAction('IDLE', {}, 'Back to idle, sir.');
      return { ok: true, speech: 'Back to idle, sir.' };
    default:
      setLastIntent(intent);
      broadcastAction('IDLE', {}, "I don't know that mirror command yet, sir.");
      return { ok: true, speech: "I don't know that mirror command yet, sir." };
  }
}
