import { create } from 'zustand';
import { mockCalendar, mockSpotify, mockTodos, mockWeather } from '../data/mockData.js';

const scenes = ['idle', 'weather', 'calendar', 'spotify', 'todo'];
const autoCloseScenes = new Set(['weather', 'calendar', 'spotify', 'todo']);
const voiceListeningTimeoutMs = Number(import.meta.env.VITE_VOICE_LISTENING_TIMEOUT_MS || 15000);
let sceneCloseTimer;
let voiceOverlayTimer;
let voiceStatusTimer;

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
  applyVoiceStatus: ({ status = 'idle', text = '' } = {}) =>
    set((state) => {
      window.clearTimeout(voiceOverlayTimer);
      window.clearTimeout(voiceStatusTimer);

      if (status === 'speaking' && text) {
        const overlayId = Date.now();
        voiceOverlayTimer = window.setTimeout(() => {
          set((current) => (current.overlay?.id === overlayId ? { isSpeaking: false, overlay: null } : { isSpeaking: false }));
        }, 5600);

        return {
          voiceStatus: {
            status,
            text,
            updatedAt: overlayId,
          },
          isListening: false,
          isSpeaking: true,
          overlay: { id: overlayId, text },
        };
      }

      const nextListening = status === 'wake_detected' || status === 'listening';
      if (nextListening && voiceListeningTimeoutMs > 0) {
        voiceStatusTimer = window.setTimeout(() => {
          set((current) => (
            current.voiceStatus.status === 'wake_detected' || current.voiceStatus.status === 'listening'
              ? {
                  voiceStatus: {
                    status: 'idle',
                    text: '',
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
          updatedAt: Date.now(),
        },
        isListening: nextListening,
        isSpeaking: false,
        overlay: state.overlay,
      };
    }),
  showSpeech: (speech) => {
    if (!speech) return;
    set({ overlay: { id: Date.now(), text: speech }, isSpeaking: true });
    window.setTimeout(() => {
      set({ isSpeaking: false, overlay: null });
    }, 5600);
  },
  applyDataUpdate: (data = {}) =>
    set((state) => ({
      data: {
        ...state.data,
        ...data,
      },
    })),
  applyAction: ({ intent, data = {}, speech }) => {
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

    set((state) => ({
      scene,
      data: {
        ...state.data,
        ...data,
      },
      overlay: speech ? { id: Date.now(), text: speech } : state.overlay,
      isSpeaking: Boolean(speech),
    }));

    if (speech) {
      window.setTimeout(() => {
        set({ isSpeaking: false, overlay: null });
      }, 5600);
    }

    window.clearTimeout(sceneCloseTimer);
    if (autoCloseScenes.has(scene)) {
      sceneCloseTimer = window.setTimeout(() => {
        if (get().scene === scene) set({ scene: 'idle' });
      }, 5200);
    }
  },
}));
