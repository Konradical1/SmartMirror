import { AnimatePresence, motion } from 'framer-motion';
import { Music2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function SpotifyBlock({ spotify, focused }) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    if (!spotify.isPlaying) return undefined;
    const interval = window.setInterval(() => setTick(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, [spotify.isPlaying]);

  const liveProgress = useMemo(() => {
    const durationMs = spotify.durationMs || 0;
    const baseProgressMs = spotify.progressMs || 0;
    const receivedAt = spotify.receivedAt || tick;
    const elapsedSinceUpdate = spotify.isPlaying ? tick - receivedAt : 0;
    const progressMs = durationMs ? Math.min(durationMs, baseProgressMs + elapsedSinceUpdate) : baseProgressMs;

    return {
      progress: durationMs ? Math.round((progressMs / durationMs) * 1000) / 10 : spotify.progress,
      elapsed: durationMs ? formatDuration(progressMs) : spotify.elapsed,
      duration: durationMs ? formatDuration(durationMs) : spotify.duration,
    };
  }, [spotify, tick]);

  return (
    <motion.div
      className={focused ? 'w-[430px]' : 'w-[260px]'}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: spotify.isPlaying ? 1 : 0, y: spotify.isPlaying ? 0 : 18, scale: spotify.isPlaying ? 1 : 0.98 }}
      transition={{ duration: spotify.isPlaying ? 0.45 : 0.75, ease: [0.16, 1, 0.3, 1] }}
      style={{ pointerEvents: spotify.isPlaying ? 'auto' : 'none' }}
    >
      <div className="hairline rounded-[8px] bg-white/[0.025] p-5 shadow-softWhite">
        <div className="mb-5 flex items-center gap-3 text-secondary">
          <Music2 size={22} strokeWidth={1.7} />
          <span className="text-[16px]">{spotify.service}</span>
        </div>

        <motion.img
          key={spotify.albumArt}
          src={spotify.albumArt}
          alt=""
          className={focused ? 'aspect-square w-full rounded-[8px] object-cover glow-teal' : 'aspect-square w-full rounded-[8px] object-cover'}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45 }}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={`${spotify.title}-${spotify.artist}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className={focused ? 'mt-7 text-[28px] font-light leading-tight' : 'mt-5 text-[19px] font-light leading-tight'}>
              {spotify.title}
            </h3>
            <p className={focused ? 'mt-2 text-[18px] text-secondary' : 'mt-2 text-[16px] text-secondary'}>{spotify.artist}</p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-6">
          <div className="h-[3px] rounded-full bg-white/15">
            <motion.div
              className="h-full rounded-full bg-mirror-teal shadow-softTeal"
              initial={{ width: 0 }}
              animate={{ width: `${liveProgress.progress}%` }}
              transition={{ duration: 0.35, ease: 'linear' }}
            />
          </div>
          <div className="mt-3 flex justify-between text-[12px] text-secondary">
            <span>{liveProgress.elapsed}</span>
            <span>{liveProgress.duration}</span>
          </div>
        </div>

        <p className={focused ? 'mt-7 text-center text-[14px] text-tertiary' : 'mt-5 text-center text-[12px] text-tertiary'}>
          Live from Spotify
        </p>
      </div>
    </motion.div>
  );
}
