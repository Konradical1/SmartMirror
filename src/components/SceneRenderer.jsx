import { AnimatePresence, motion } from 'framer-motion';
import { useMirrorStore } from '../store/useMirrorStore.js';
import CalendarFull from './calendar/CalendarFull.jsx';
import CalendarPreview from './calendar/CalendarPreview.jsx';
import SpotifyBlock from './spotify/SpotifyBlock.jsx';
import TimeBlock from './time/TimeBlock.jsx';
import TodoList from './todo/TodoList.jsx';
import WeatherBlock from './weather/WeatherBlock.jsx';

const positions = {
  time: {
    idle: { left: '8%', top: '8%', x: 0, y: 0 },
    weather: { left: '5%', top: '8%', x: -18, y: 0 },
    calendar: { left: '6%', top: '7%', x: -12, y: 0 },
    spotify: { left: '6%', top: '7%', x: -12, y: 0 },
    todo: { left: '6%', top: '7%', x: -12, y: 0 },
  },
  weather: {
    idle: { left: '69%', top: '8%', x: 0, y: 0 },
    weather: { left: '50%', top: '50%', x: '-50%', y: '-50%' },
    calendar: { left: '71%', top: '7%', x: 18, y: 0 },
    spotify: { left: '71%', top: '7%', x: 18, y: 0 },
    todo: { left: '71%', top: '7%', x: 18, y: 0 },
  },
  spotify: {
    idle: { left: '8%', top: '47%', x: 0, y: 0 },
    weather: { left: '6%', top: '47%', x: -18, y: 0 },
    calendar: { left: '5%', top: '47%', x: -18, y: 0 },
    spotify: { left: '50%', top: '50%', x: '-50%', y: '-50%' },
    todo: { left: '6%', top: '47%', x: -18, y: 0 },
  },
  calendar: {
    idle: { left: '8%', top: '79%', x: 0, y: 0 },
    weather: { left: '8%', top: '85%', x: 0, y: 14 },
    calendar: { left: '50%', top: '50%', x: '-50%', y: '-50%' },
    spotify: { left: '8%', top: '85%', x: 0, y: 14 },
    todo: { left: '8%', top: '85%', x: 0, y: 14 },
  },
  todo: {
    idle: { left: '60%', top: '73%', x: 0, y: 0 },
    weather: { left: '62%', top: '78%', x: 18, y: 0 },
    calendar: { left: '62%', top: '78%', x: 18, y: 0 },
    spotify: { left: '62%', top: '78%', x: 18, y: 0 },
    todo: { left: '50%', top: '55%', x: '-50%', y: '-50%' },
  },
};

const widths = {
  time: '330px',
  weather: '520px',
  spotify: '430px',
  calendar: '450px',
  todo: '560px',
};

function Positioned({ id, children, focused = false, hidden = false }) {
  const scene = useMirrorStore((state) => state.scene);
  const dimmed = scene !== 'idle' && !focused;
  const position = positions[id][scene];

  return (
    <motion.section
      className="absolute"
      style={{ transformOrigin: 'center', width: widths[id] }}
      animate={{
        left: position.left,
        top: position.top,
        x: position.x,
        y: position.y,
        opacity: hidden ? 0 : dimmed ? 0.5 : 1,
        scale: focused ? 1.05 : 1,
        filter: focused ? 'drop-shadow(0 0 34px rgba(0, 229, 255, 0.13))' : 'drop-shadow(0 0 0 rgba(0,0,0,0))',
      }}
      transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.section>
  );
}

export default function SceneRenderer() {
  const scene = useMirrorStore((state) => state.scene);
  const data = useMirrorStore((state) => state.data);

  return (
    <div className="mirror-canvas">
      <Positioned id="time">
        <TimeBlock />
      </Positioned>

      <Positioned id="weather" focused={scene === 'weather'}>
        <WeatherBlock weather={data.weather} focused={scene === 'weather'} />
      </Positioned>

      <Positioned id="spotify" focused={scene === 'spotify'} hidden={scene === 'weather' || scene === 'calendar' || scene === 'todo'}>
        <SpotifyBlock spotify={data.spotify} focused={scene === 'spotify'} />
      </Positioned>

      <Positioned id="calendar" focused={scene === 'calendar'} hidden={scene === 'weather' || scene === 'calendar' || scene === 'todo'}>
        <CalendarPreview days={data.calendar.slice(0, 3)} />
      </Positioned>

      <Positioned id="todo" focused={scene === 'todo'} hidden={scene === 'weather' || scene === 'calendar'}>
        <TodoList todos={data.todos} focused={scene === 'todo'} />
      </Positioned>

      <AnimatePresence>
        {scene === 'calendar' && (
          <motion.div
            className="absolute bottom-[18%] left-[6%] right-[6%] top-[41%]"
            initial={{ opacity: 0, y: 34, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.985 }}
            transition={{ duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
          >
            <CalendarFull days={data.calendar.slice(0, 7)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
