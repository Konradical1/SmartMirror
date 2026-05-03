import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
} from '../services/calendarService.js';
import { setLastIntent, setScene, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';

export async function handleCalendar(params = {}, speech = '') {
  const calendar = await refreshCalendar(params);
  setScene('calendar');
  setLastIntent('SHOW_CALENDAR');
  const responseSpeech = summarizeCalendar(calendar, params);
  broadcastAction('SHOW_CALENDAR', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { calendar } };
}

export async function refreshCalendar(params = {}) {
  const calendar = await getCalendarEvents(params);
  if (calendar) {
    updateContext('calendar', calendar);
    broadcastData({ calendar });
  }
  return calendar;
}

export async function handleAddCalendarEvent(params = {}) {
  const event = await createCalendarEvent(params);
  const calendar = await refreshCalendar();
  setScene('calendar');
  setLastIntent('ADD_CALENDAR_EVENT');
  const responseSpeech = `Added ${event.title} ${eventTiming(event)}, sir. Calendar bureaucracy complete.`;
  broadcastAction('SHOW_CALENDAR', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { event, calendar } };
}

export async function handleEditCalendarEvent(params = {}) {
  const event = await updateCalendarEvent(params);
  const calendar = await refreshCalendar();
  setScene('calendar');
  setLastIntent('EDIT_CALENDAR_EVENT');
  const responseSpeech = `Updated ${event.title}, sir. Time itself has been bullied into compliance.`;
  broadcastAction('SHOW_CALENDAR', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { event, calendar } };
}

export async function handleDeleteCalendarEvent(params = {}) {
  const event = await deleteCalendarEvent(params);
  const calendar = await refreshCalendar();
  setScene('calendar');
  setLastIntent('DELETE_CALENDAR_EVENT');
  const responseSpeech = `Deleted ${event.title}, sir. It never happened.`;
  broadcastAction('SHOW_CALENDAR', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { event, calendar } };
}

function summarizeCalendar(calendar, params = {}) {
  if (!calendar?.length) return 'Your calendar is unavailable, sir. Very mysterious.';

  const query = String(params.query || params.search || params.title || '').trim().toLowerCase();
  if (query) {
    const matches = eventsWithDays(calendar).filter(({ event }) => event.title.toLowerCase().includes(query));
    if (!matches.length) return `I do not see ${query} in the next seven days, sir. Calendar claims innocence.`;

    const { day, event } = matches[0];
    return `${event.title} is ${day.day}, ${day.date} at ${event.time}, sir.`;
  }

  if (params.range === 'today') {
    const today = calendar[0];
    if (!today?.events.length) return 'Nothing else on the calendar today, sir. A rare administrative miracle.';
    const events = today.events.slice(0, 3).map((event) => `${event.title} at ${event.time}`).join(', ');
    return `Today you have ${events}, sir.`;
  }

  const count = calendar?.reduce((total, day) => total + day.events.length, 0) || 0;
  if (!count) return 'Your calendar looks open this week, sir. Suspiciously peaceful.';

  const next = eventsWithDays(calendar)[0];
  return `${count} events ahead this week, sir. Next up: ${next.event.title} on ${next.day.day} at ${next.event.time}.`;
}

function eventsWithDays(calendar) {
  return calendar.flatMap((day) => day.events.map((event) => ({ day, event })));
}

function eventTiming(event) {
  if (!event.date) return 'to your calendar';
  if (!event.time || event.time === 'All day') return `on ${event.date}`;
  return `on ${event.date} at ${event.time}`;
}
