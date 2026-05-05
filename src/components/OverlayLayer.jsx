import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useMirrorStore } from '../store/useMirrorStore.js';

function voiceMode(status, isSpeaking) {
  if (isSpeaking || status === 'speaking') return 'speaking';
  if (status === 'thinking') return 'thinking';
  if (status === 'wake_detected' || status === 'listening') return 'listening';
  if (status === 'error') return 'error';
  return 'idle';
}

function OrbBars({ mode }) {
  const bars = mode === 'thinking' ? 3 : 4;
  return (
    <div className="voice-orb-bars">
      {Array.from({ length: bars }).map((_, index) => (
        <motion.span
          key={index}
          className="voice-orb-bar"
          animate={{
            height: mode === 'thinking' ? [8, 28, 8] : [10, 22, 10],
            opacity: mode === 'idle' ? [0.18, 0.36, 0.18] : [0.34, 0.95, 0.34],
          }}
          transition={{
            delay: index * 0.08,
            duration: mode === 'thinking' ? 0.72 : 0.95,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function VoiceOrb({ mode }) {
  return (
    <motion.div
      className={`voice-orb voice-orb-${mode}`}
      layout
      animate={{
        width: mode === 'speaking' ? 44 : mode === 'thinking' ? 76 : mode === 'listening' ? 64 : 38,
        height: mode === 'speaking' ? 44 : mode === 'thinking' ? 76 : mode === 'listening' ? 64 : 38,
        borderRadius: mode === 'thinking' ? 22 : 999,
        scale: mode === 'thinking' ? [1, 1.06, 1] : 1,
      }}
      transition={{
        width: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
        height: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
        borderRadius: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
        scale: mode === 'thinking' ? { duration: 1.05, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.24 },
      }}
    >
      <OrbBars mode={mode} />
    </motion.div>
  );
}

function AIOverlay({ text, mode }) {
  const words = useMemo(() => text.split(' '), [text]);
  const wordDelaySeconds = 0.22;
  const hasText = Boolean(text);

  return (
    <motion.div
      className="voice-overlay"
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: mode === 'idle' ? 0.44 : 1, y: 0 }}
      exit={{ opacity: 0, y: 22 }}
      transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div className={`voice-overlay-inner voice-overlay-${mode}`} layout>
        <VoiceOrb mode={mode} />
        <AnimatePresence mode="wait">
          {hasText && (
            <motion.p
              key={text}
              className="voice-overlay-text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.24 }}
            >
              {words.map((word, index) => (
                <motion.span
                  key={`${word}-${index}`}
                  className="inline-block pr-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + index * wordDelaySeconds, duration: 0.3 }}
                >
                  {word}
                </motion.span>
              ))}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function OverlayLayer() {
  const overlay = useMirrorStore((state) => state.overlay);
  const isSpeaking = useMirrorStore((state) => state.isSpeaking);
  const voiceStatus = useMirrorStore((state) => state.voiceStatus);
  const mode = voiceMode(voiceStatus.status, isSpeaking);
  const text = overlay?.text || '';

  return (
    <AnimatePresence>
      {mode !== 'idle' && <AIOverlay key="voice-overlay" text={text} mode={mode} />}
    </AnimatePresence>
  );
}
