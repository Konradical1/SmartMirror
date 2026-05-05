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
import { loadMemory, updateMemory } from './services/memoryService.js';
import { setLastIntent, setScene } from './state.js';
import { broadcastAction } from './websocket.js';

export async function handleIntent(intent, params = {}) {
  switch (intent) {
    case 'SHOW_WEATHER':
      return handleWeather(params);
    case 'SHOW_CALENDAR':
      return handleCalendar(params);
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
      return handleSpotify(params);
    case 'SPOTIFY_NEXT':
    case 'SPOTIFY_PREVIOUS':
    case 'SPOTIFY_PAUSE':
    case 'SPOTIFY_PLAY':
      return handleSpotifyControl(intent, params);
    case 'SHOW_TODO':
    case 'SHOW_TODOS':
    case 'SHOW_TASKS':
      return handleTodo(params);
    case 'ADD_TODO':
    case 'ADD_TASK':
    case 'CREATE_TODO':
    case 'CREATE_TASK':
    case 'ADD_TODO_LIST':
      return handleAddTodo(params);
    case 'CHECK_TODO':
    case 'CHECK_TASK':
    case 'COMPLETE_TODO':
    case 'COMPLETE_TASK':
      return handleCheckTodo(params);
    case 'SHOW_EMAIL':
      return handleEmail(params);
    case 'UPDATE_MEMORY':
    case 'REMEMBER': {
      const memory = await updateMemory(params);
      setLastIntent('UPDATE_MEMORY');
      return { ok: true, data: { memory } };
    }
    case 'SHOW_MEMORY': {
      const memory = await loadMemory();
      setLastIntent('SHOW_MEMORY');
      return { ok: true, speech: '', data: { memory } };
    }
    case 'DISPLAY_MESSAGE':
      setLastIntent('DISPLAY_MESSAGE');
      return { ok: true, data: { message: params.message || params.text || '' } };
    case 'IDLE':
      setScene('idle');
      setLastIntent('IDLE');
      broadcastAction('IDLE');
      return { ok: true, data: {}, ui: { scene: 'idle' } };
    default:
      setLastIntent(intent);
      broadcastAction('IDLE');
      return { ok: true, data: { unknownIntent: intent }, ui: { scene: 'idle' } };
  }
}
