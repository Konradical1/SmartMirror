import { __calendarTest } from '../src/services/calendarService.js';

const originalDate = globalThis.Date;
const fixedNow = new originalDate('2026-05-03T00:30:00.000Z');

class FixedDate extends originalDate {
  constructor(...args) {
    super(...(args.length ? args : [fixedNow]));
  }

  static now() {
    return fixedNow.getTime();
  }
}

globalThis.Date = FixedDate;

const calendar = __calendarTest.groupEvents([
  {
    id: 'school',
    summary: 'School',
    start: { date: '2026-05-04' },
  },
]);

globalThis.Date = originalDate;

const monday = calendar.find((day) => day.day === 'Monday');
const sunday = calendar.find((day) => day.day === 'Sunday');

if (!monday?.events.some((event) => event.title === 'School')) {
  throw new Error(`Expected School on Monday. Calendar: ${JSON.stringify(calendar)}`);
}

if (sunday?.events.some((event) => event.title === 'School')) {
  throw new Error(`School incorrectly appeared on Sunday. Calendar: ${JSON.stringify(calendar)}`);
}

console.log('calendar date grouping ok');
