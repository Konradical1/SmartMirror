export const mockWeather = {
  location: 'Anderson Township, OH',
  temperature: 61,
  feelsLike: 61,
  condition: 'Partly cloudy',
  wind: '11 mph',
  humidity: '64%',
  updated: '3:45 PM',
  forecast: [
    { day: 'Today', high: 63, low: 51, condition: 'partly' },
    { day: 'Tomorrow', high: 55, low: 41, condition: 'partly' },
    { day: 'Friday', high: 60, low: 44, condition: 'clear' },
  ],
  hourly: [
    { time: '4 PM', temp: 61, condition: 'partly' },
    { time: '6 PM', temp: 58, condition: 'partly' },
    { time: '8 PM', temp: 54, condition: 'clear' },
    { time: '10 PM', temp: 50, condition: 'clear' },
  ],
};

export const mockCalendar = [
  {
    day: 'Wednesday',
    date: 'Apr 29',
    events: [
      { time: '8:00 AM', title: 'School', color: '#68E083', duration: 7 },
      { time: '3:30 PM', title: 'Track Practice', color: '#8B5CF6', duration: 1.5 },
    ],
  },
  {
    day: 'Thursday',
    date: 'Apr 30',
    events: [
      { time: '8:00 AM', title: 'School', color: '#68E083', duration: 7 },
      { time: '3:30 PM', title: 'Track Practice', color: '#8B5CF6', duration: 1.5 },
    ],
  },
  {
    day: 'Friday',
    date: 'May 1',
    events: [
      { time: '8:00 AM', title: 'Work', color: '#FF9A3C', duration: 4 },
      { time: '3:30 PM', title: 'Track Practice', color: '#8B5CF6', duration: 1.5 },
    ],
  },
  {
    day: 'Saturday',
    date: 'May 2',
    events: [
      { time: '10:00 AM', title: 'Groceries', color: '#00E5FF', duration: 1 },
      { time: '6:00 PM', title: 'Dinner', color: '#FF9A3C', duration: 2 },
    ],
  },
  {
    day: 'Sunday',
    date: 'May 3',
    events: [
      { time: '9:30 AM', title: 'Run', color: '#68E083', duration: 1 },
      { time: '2:00 PM', title: 'Weekend trip', color: '#8B5CF6', duration: 3 },
    ],
  },
  {
    day: 'Monday',
    date: 'May 4',
    events: [
      { time: '8:00 AM', title: 'School', color: '#68E083', duration: 7 },
      { time: '4:30 PM', title: 'Study block', color: '#00E5FF', duration: 1.5 },
    ],
  },
  {
    day: 'Tuesday',
    date: 'May 5',
    events: [
      { time: '8:00 AM', title: 'School', color: '#68E083', duration: 7 },
      { time: '7:00 PM', title: 'Portfolio review', color: '#8B5CF6', duration: 1 },
    ],
  },
];

export const mockSpotify = {
  isPlaying: true,
  service: 'Spotify',
  title: 'Night Drive',
  artist: 'The Midnight',
  progress: 38,
  elapsed: '1:43',
  duration: '4:26',
  albumArt:
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=70',
};

export const mockTodos = [
  { id: 1, title: 'Finish math homework', tag: 'School', date: 'Apr 29', done: false },
  { id: 2, title: 'Study for biology test', tag: 'School', date: 'Apr 30', done: false },
  { id: 3, title: 'Update portfolio website', tag: 'Personal', date: 'May 1', done: false },
  { id: 4, title: 'Buy groceries', tag: 'Personal', date: 'May 2', done: false },
  { id: 5, title: 'Plan weekend trip', tag: 'Personal', date: 'May 3', done: false },
];
