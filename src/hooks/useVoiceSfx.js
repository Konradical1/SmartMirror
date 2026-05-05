import { useEffect, useRef } from 'react';
import { useMirrorStore } from '../store/useMirrorStore.js';

const audioPaths = {
  interrupt: '/audio/Interupt.mp3',
  listening: '/audio/Listening.mp3',
  stopListening: '/audio/StopListening.mp3',
  thinking: '/audio/Thinking.wav',
};

const listeningStatuses = new Set(['wake_detected', 'listening']);

function resetAudio(audio) {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function playFromStart(audio) {
  if (!audio) return Promise.resolve();
  audio.pause();
  audio.currentTime = 0;
  return audio.play().catch(() => {});
}

function playOnce(audio) {
  if (!audio) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', finish);
      resolve();
    };

    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(finish);
  });
}

export function useVoiceSfx() {
  const voiceStatus = useMirrorStore((state) => state.voiceStatus);
  const soundsRef = useRef(null);
  const previousStatusRef = useRef('idle');
  const latestStatusRef = useRef('idle');
  const listeningSessionRef = useRef(false);
  const thinkingSequenceRef = useRef(0);

  useEffect(() => {
    const sounds = {
      interrupt: new Audio(audioPaths.interrupt),
      listening: new Audio(audioPaths.listening),
      stopListening: new Audio(audioPaths.stopListening),
      thinking: new Audio(audioPaths.thinking),
    };

    Object.values(sounds).forEach((audio) => {
      audio.preload = 'auto';
    });
    sounds.thinking.loop = true;

    soundsRef.current = sounds;

    return () => {
      thinkingSequenceRef.current += 1;
      Object.values(sounds).forEach(resetAudio);
      soundsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const sounds = soundsRef.current;
    if (!sounds) return;

    const status = voiceStatus.status || 'idle';
    const previousStatus = previousStatusRef.current;
    const isListening = listeningStatuses.has(status);
    const wasThinking = previousStatus === 'thinking';
    const enteringDone = status === 'done' && previousStatus !== 'done';
    const enteringThinking = status === 'thinking' && previousStatus !== 'thinking';
    const enteringListening = isListening && !listeningSessionRef.current;

    latestStatusRef.current = status;

    if (enteringListening) {
      thinkingSequenceRef.current += 1;
      resetAudio(sounds.thinking);
      resetAudio(sounds.stopListening);
      listeningSessionRef.current = true;
      playFromStart(sounds.listening);
    }

    if (enteringDone) {
      thinkingSequenceRef.current += 1;
      listeningSessionRef.current = false;
      resetAudio(sounds.listening);
      resetAudio(sounds.stopListening);
      resetAudio(sounds.thinking);
      playFromStart(sounds.interrupt);
    }

    if (enteringThinking) {
      const sequence = thinkingSequenceRef.current + 1;
      thinkingSequenceRef.current = sequence;
      listeningSessionRef.current = false;
      resetAudio(sounds.interrupt);
      resetAudio(sounds.listening);
      resetAudio(sounds.thinking);

      playOnce(sounds.stopListening).then(() => {
        if (thinkingSequenceRef.current !== sequence || latestStatusRef.current !== 'thinking') return;
        sounds.thinking.currentTime = 0;
        sounds.thinking.play().catch(() => {});
      });
    }

    if (status !== 'thinking' && (wasThinking || !enteringListening)) {
      thinkingSequenceRef.current += 1;
      resetAudio(sounds.stopListening);
      resetAudio(sounds.thinking);
    }

    if (!isListening && status !== 'thinking') {
      listeningSessionRef.current = false;
    }

    previousStatusRef.current = status;
  }, [voiceStatus.status, voiceStatus.updatedAt]);
}
