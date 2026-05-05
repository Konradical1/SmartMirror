import { create } from 'zustand';
import { mockCalendar, mockSpotify, mockTodos, mockWeather } from '../data/mockData.js';

const scenes = ['idle', 'weather', 'calendar', 'spotify', 'todo'];
const autoCloseScenes = new Set(['weather', 'calendar', 'spotify', 'todo']);
const voiceListeningTimeoutMs = Number(import.meta.env.VITE_VOICE_LISTENING_TIMEOUT_MS || 15000);
const minSpeechDisplayMs = Number(import.meta.env.VITE_SPEECH_MIN_DISPLAY_MS || 4200);
const maxSpeechDisplayMs = Number(import.meta.env.VITE_SPEECH_MAX_DISPLAY_MS || 22000);
const minSceneDisplayMs = Number(import.meta.env.VITE_SCENE_MIN_DISPLAY_MS || 9000);
const maxSceneDisplayMs = Number(import.meta.env.VITE_SCENE_MAX_DISPLAY_MS || 30000);
let sceneCloseTimer;
let voiceOverlayTimer;
let voiceStatusTimer;

function clampDuration(value, min, max) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.min(max, Math.max(min, duration));
}

function speechDisplayMs(text = '', preferredMs) {
  const explicit = clampDuration(preferredMs, minSpeechDisplayMs, maxSpeechDisplayMs);
  if (explicit) return explicit;

  const value = String(text || '').trim();
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const charCount = value.length;
  const estimatedSpeakingMs = Math.max(wordCount * 360, charCount * 48);
  return Math.min(maxSpeechDisplayMs, Math.max(minSpeechDisplayMs, 1400 + estimatedSpeakingMs));
}

function sceneDisplayMs({ data = {}, ui = {}, speech = '', displayMs } = {}) {
  const explicit = clampDuration(displayMs ?? ui?.displayMs ?? data?.displayMs ?? data?.ui?.displayMs, minSceneDisplayMs, maxSceneDisplayMs);
  if (explicit) return explicit;

  const speechMs = speech ? speechDisplayMs(speech) : 0;
  return Math.min(maxSceneDisplayMs, Math.max(minSceneDisplayMs, speechMs + 3000));
}

export const useMirrorStore = create((set, get) => ({
  scene: 'idle',
  data: {
    weather: mockWeather,
    calendar: mockCalendar,
    spotify: mockSpotify,
    todos: mockTodos,
  },
  overlay: null,
  isListening: false,
  isSpeaking: false,
  voiceStatus: {
    status: 'idle',
    text: '',
    phase: '',
    source: '',
    final: false,
    updatedAt: Date.now(),
  },
  cycleScene: () => {
    const index = scenes.indexOf(get().scene);
    set({ scene: scenes[(index + 1) % scenes.length] });
  },
  setScene: (scene) => set({ scene }),
  setOverlay: (overlay) => set({ overlay }),
  setListening: (isListening) => set({ isListening }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  applyVoiceStatus: ({ status = 'idle', text = '', phase = '', source = '', final = false, displayMs } = {}) =>
    set((state) => {
      window.clearTimeout(voiceOverlayTimer);
      window.clearTimeout(voiceStatusTimer);

      if (status === 'speaking' && text) {
        const overlayId = Date.now();
        const holdMs = speechDisplayMs(text, displayMs);
        voiceOverlayTimer = window.setTimeout(() => {
          set((current) => (current.overlay?.id === overlayId ? { isSpeaking: false, overlay: null } : { isSpeaking: false }));
        }, holdMs);

        return {
          voiceStatus: {
            status,
            text,
            phase,
            source,
            final,
            displayMs: holdMs,
            updatedAt: overlayId,
          },
          isListening: false,
          isSpeaking: true,
          overlay: { id: overlayId, text, displayMs: holdMs },
        };
      }

      if (status === 'done') {
        voiceStatusTimer = window.setTimeout(() => {
          set((current) => (
            current.voiceStatus.status === 'done'
              ? {
                  voiceStatus: {
                    status: 'idle',
                    text: '',
                    phase: '',
                    source: '',
                    final: false,
                    updatedAt: Date.now(),
                  },
                  isListening: false,
                  isSpeaking: false,
                }
              : {}
          ));
        }, 1800);
      }

      const nextListening = status === 'wake_detected' || status === 'listening';
      const shouldClearOverlay = nextListening || status === 'thinking' || status === 'done';
      if (nextListening && voiceListeningTimeoutMs > 0) {
        voiceStatusTimer = window.setTimeout(() => {
          set((current) => (
            current.voiceStatus.status === 'wake_detected' || current.voiceStatus.status === 'listening'
              ? {
                  voiceStatus: {
                    status: 'idle',
                    text: '',
                    phase: '',
                    source: '',
                    final: false,
                    updatedAt: Date.now(),
                  },
                  isListening: false,
                }
              : {}
          ));
        }, voiceListeningTimeoutMs);
      }

      return {
        voiceStatus: {
          status,
          text,
          phase,
          source,
          final,
          displayMs,
          updatedAt: Date.now(),
        },
        isListening: nextListening,
        isSpeaking: false,
        overlay: shouldClearOverlay ? null : state.overlay,
      };
    }),
  showSpeech: (speech, options = {}) => {
    if (!speech) return;
    window.clearTimeout(voiceOverlayTimer);
    const overlayId = Date.now();
    const holdMs = speechDisplayMs(speech, options.displayMs);
    set({ overlay: { id: overlayId, text: speech, displayMs: holdMs }, isSpeaking: true });
    voiceOverlayTimer = window.setTimeout(() => {
      set((current) => (current.overlay?.id === overlayId ? { isSpeaking: false, overlay: null } : { isSpeaking: false }));
    }, holdMs);
  },
  applyDataUpdate: (data = {}) =>
    set((state) => ({
      data: {
        ...state.data,
        ...data,
      },
    })),
  applyAction: ({ intent, data = {}, speech, ui = {}, displayMs }) => {
    const intentToScene = {
      SHOW_WEATHER: 'weather',
      SHOW_CALENDAR: 'calendar',
      SHOW_SPOTIFY: 'spotify',
      SHOW_TODO: 'todo',
      ADD_TODO: 'todo',
      CHECK_TODO: 'todo',
      SPOTIFY_NEXT: 'spotify',
      SPOTIFY_PREVIOUS: 'spotify',
      SPOTIFY_TOGGLE: 'spotify',
      SPOTIFY_PAUSE: 'spotify',
      SPOTIFY_PLAY: 'spotify',
    };
    const scene = intentToScene[intent] ?? 'idle';

    const overlayId = Date.now();
    const speechHoldMs = speechDisplayMs(speech, ui?.speechDisplayMs ?? data?.speechDisplayMs);
    const sceneHoldMs = sceneDisplayMs({ data, ui, speech, displayMs });

    set((state) => ({
      scene,
      data: {
        ...state.data,
        ...data,
      },
      overlay: speech ? { id: overlayId, text: speech, displayMs: speechHoldMs } : state.overlay,
      isSpeaking: Boolean(speech),
    }));

    if (speech) {
      window.clearTimeout(voiceOverlayTimer);
      voiceOverlayTimer = window.setTimeout(() => {
        set((current) => (current.overlay?.id === overlayId ? { isSpeaking: false, overlay: null } : { isSpeaking: false }));
      }, speechHoldMs);
    }

    window.clearTimeout(sceneCloseTimer);
    if (autoCloseScenes.has(scene)) {
      sceneCloseTimer = window.setTimeout(() => {
        if (get().scene === scene) set({ scene: 'idle' });
      }, sceneHoldMs);
    }
  },
}));
