import { motion } from 'framer-motion';

export default function CalendarFull({ days }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-7 flex shrink-0 items-end justify-between">
        <div>
          <p className="text-[15px] uppercase tracking-normal text-secondary">Calendar</p>
          <h2 className="mt-2 text-[42px] font-thin leading-none">Seven-day summary</h2>
        </div>
        <p className="text-[15px] text-tertiary">This week</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 border-t border-white/14">
        {days.map((day, dayIndex) => (
          <motion.div
            key={day.date}
            className="min-w-0 border-l border-white/10 px-3 py-5 first:border-l-0"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dayIndex * 0.045, duration: 0.42, ease: 'easeOut' }}
          >
            <p className="truncate text-[12px] uppercase text-tertiary">{day.day}</p>
            <p className="mt-2 text-[22px] font-light text-primary">{day.date}</p>

            <div className="mt-6 space-y-4">
              {day.events.map((event, eventIndex) => (
                <motion.div
                  key={`${day.date}-${event.title}`}
                  className="rounded-[7px] border border-white/10 px-3 py-3"
                  style={{
                    background: `linear-gradient(90deg, ${event.color}22, rgba(255,255,255,0.025))`,
                  }}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.12 + dayIndex * 0.045 + eventIndex * 0.035, duration: 0.32 }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
                    <p className="min-w-0 truncate text-[13px] text-primary">{event.title}</p>
                  </div>
                  <p className="mt-2 text-[11px] text-secondary">{event.time}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 h-[3px] rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: day.events[0]?.color || '#00E5FF' }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, day.events.length * 34)}%` }}
                transition={{ delay: 0.22 + dayIndex * 0.045, duration: 0.45 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
