import { motion } from 'framer-motion';

export default function CalendarPreview({ days }) {
  return (
    <div className="grid w-[450px] grid-cols-3 gap-4">
      {days.map((day, index) => (
        <motion.div
          key={day.date}
          className="hairline rounded-[8px] px-5 py-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08, duration: 0.45 }}
        >
          <p className="text-[12px] uppercase text-secondary">{day.day}</p>
          <p className="mt-3 text-[18px] font-light text-primary">{day.date}</p>
          <div className="mt-8 space-y-5">
            {day.events.map((event) => (
              <div key={`${day.date}-${event.title}`} className="flex min-w-0 items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
                <span className="shrink-0 text-[11px] text-secondary">{event.time}</span>
                <span className="truncate text-[11px] text-primary">{event.title}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
