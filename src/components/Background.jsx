import { motion } from 'framer-motion';
import { useMirrorStore } from '../store/useMirrorStore.js';

const tintByScene = {
  idle: 'rgba(0, 229, 255, 0.025)',
  weather: 'rgba(0, 229, 255, 0.055)',
  calendar: 'rgba(104, 224, 131, 0.035)',
  spotify: 'rgba(139, 92, 246, 0.035)',
};

export default function Background() {
  const scene = useMirrorStore((state) => state.scene);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 bg-black">
      <motion.div
        className="absolute inset-[-12%]"
        animate={{
          background: [
            `radial-gradient(circle at 24% 18%, ${tintByScene[scene]}, transparent 32%), radial-gradient(circle at 78% 78%, rgba(255,255,255,0.018), transparent 34%)`,
            `radial-gradient(circle at 28% 22%, ${tintByScene[scene]}, transparent 34%), radial-gradient(circle at 72% 72%, rgba(255,255,255,0.022), transparent 32%)`,
          ],
        }}
        transition={{ duration: 9, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.24)_72%,rgba(0,0,0,0.88)_100%)]" />
    </div>
  );
}
