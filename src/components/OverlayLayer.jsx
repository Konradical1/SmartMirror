import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useMirrorStore } from '../store/useMirrorStore.js';

function AIOverlay({ text }) {
  const words = useMemo(() => text.split(' '), [text]);

  return (
    <motion.div
      className="fixed inset-x-0 bottom-[1.8vh] z-20 flex justify-center text-center"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.38 }}
    >
      <div className="flex w-[min(78vw,680px)] flex-col items-center">
        <motion.div
          className="mb-5 h-11 w-11 rounded-full border border-mirror-teal/25"
          animate={{
            boxShadow: ['0 0 16px rgba(0,229,255,0.12)', '0 0 42px rgba(0,229,255,0.24)', '0 0 16px rgba(0,229,255,0.12)'],
            scale: [1, 1.04, 1],
          }}
          transition={{ duration: 1.55, repeat: Infinity, ease: 'easeInOut' }}
        />
        <p className="w-full text-center text-[clamp(18px,2.35vw,28px)] font-light leading-snug">
          {words.map((word, index) => (
            <motion.span
              key={`${word}-${index}`}
              className="inline-block pr-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + index * 0.09, duration: 0.34 }}
            >
              {word}
            </motion.span>
          ))}
        </p>
      </div>
    </motion.div>
  );
}

function ListeningIndicator() {
  return (
    <div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
      {[0, 1, 2, 3].map((bar) => (
        <motion.span
          key={bar}
          className="block w-[3px] rounded-full bg-mirror-teal"
          animate={{ height: [12, 34, 12], opacity: [0.35, 1, 0.35] }}
          transition={{ delay: bar * 0.08, duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export default function OverlayLayer() {
  const overlay = useMirrorStore((state) => state.overlay);
  const isListening = useMirrorStore((state) => state.isListening);
  const isSpeaking = useMirrorStore((state) => state.isSpeaking);

  return (
    <AnimatePresence>
      {overlay && <AIOverlay key={overlay.id} text={overlay.text} />}
      {isListening && !isSpeaking && <ListeningIndicator key="listening" />}
    </AnimatePresence>
  );
}
