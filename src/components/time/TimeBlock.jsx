import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

function getGreeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TimeBlock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const time = useMemo(
    () =>
      now.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
    [now],
  );
  const period = time.split(' ').at(-1);
  const clock = time.replace(` ${period}`, '');
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      className="w-[330px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <p className="mb-4 text-[18px] font-light leading-none text-secondary">
        {getGreeting(now.getHours())}
      </p>
      <div className="flex items-end gap-4">
        <h1 className="text-[92px] font-thin leading-[0.86] tracking-normal text-primary">
          {clock}
        </h1>
        <span className="pb-2 text-[26px] font-light text-tertiary">{period}</span>
      </div>
      <p className="mt-6 text-[17px] font-light text-primary">{date}</p>
    </motion.div>
  );
}
