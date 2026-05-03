import { motion } from 'framer-motion';
import { Droplets, MapPin, Wind } from 'lucide-react';
import WeatherIcon from './WeatherIcon.jsx';

export default function WeatherBlock({ weather, focused }) {
  return (
    <motion.div
      className={focused ? 'w-[520px]' : 'w-[275px]'}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="mb-8 flex items-center justify-end gap-3 text-[14px] text-secondary">
        <MapPin size={16} strokeWidth={1.7} />
        <span>{weather.location}</span>
      </div>

      <div className={focused ? 'flex items-center justify-center gap-8' : 'flex items-center justify-end gap-5'}>
        <WeatherIcon condition={weather.condition} size={focused ? 90 : 66} className="text-primary" />
        <div className="flex items-start">
          <span className={focused ? 'text-[116px] font-thin leading-none' : 'text-[76px] font-thin leading-none'}>
            {weather.temperature}
          </span>
          <span className={focused ? 'text-[58px] font-thin leading-none' : 'text-[42px] font-thin leading-none'}>°</span>
        </div>
      </div>

      <p className={focused ? 'mt-5 text-center text-[22px] text-secondary' : 'mt-7 text-right text-[17px] text-secondary'}>
        Feels like {weather.feelsLike}°
      </p>

      <div className={focused ? 'mt-8 flex justify-center gap-12 text-[18px] text-secondary' : 'mt-8 flex justify-end gap-8 text-[16px] text-secondary'}>
        <span className="flex items-center gap-2">
          <Wind size={focused ? 20 : 17} strokeWidth={1.6} />
          {weather.wind}
        </span>
        <span className="flex items-center gap-2">
          <Droplets size={focused ? 20 : 17} strokeWidth={1.6} />
          {weather.humidity}
        </span>
      </div>

      <div className="my-8 h-px w-full bg-white/15" />

      <div className={focused ? 'grid grid-cols-3 gap-6' : 'space-y-5'}>
        {weather.forecast.map((day, index) => (
          <motion.div
            key={day.day}
            className={focused ? 'hairline rounded-[8px] px-5 py-5 text-center' : 'grid grid-cols-[1fr_auto_auto] items-center gap-6 text-[16px]'}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.35 }}
          >
            <span className={focused ? 'block text-[16px] text-secondary' : 'text-primary'}>{day.day}</span>
            <WeatherIcon condition={day.condition} size={focused ? 32 : 24} className={focused ? 'mx-auto my-4 text-primary' : 'text-primary'} />
            <span className={focused ? 'block text-[22px]' : 'text-primary'}>{day.high}°</span>
            <span className={focused ? 'block text-[18px] text-tertiary' : 'text-tertiary'}>{day.low}°</span>
          </motion.div>
        ))}
      </div>

      {focused && (
        <div className="mt-8 grid grid-cols-4 gap-3">
          {weather.hourly.map((hour, index) => (
            <motion.div
              key={hour.time}
              className="rounded-[8px] border border-white/10 px-3 py-4 text-center"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + index * 0.06, duration: 0.35 }}
            >
              <p className="text-[13px] text-tertiary">{hour.time}</p>
              <WeatherIcon condition={hour.condition} size={24} className="mx-auto my-3 text-primary" />
              <p className="text-[20px] font-light">{hour.temp}°</p>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
