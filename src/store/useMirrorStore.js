import { create } from 'zustand';
import { mockCalendar, mockSpotify, mockTodos, mockWeather } from '../data/mockData.js';

const scenes = ['idle', 'weather', 'calendar', 'spotify', 'todo'];
const autoCloseScenes = new Set(['weather', 'calendar', 'spotify', 'todo']);
let sceneCloseTimer;

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
  cycleScene: () => {
    const index = scenes.indexOf(get().scene);
    set({ scene: scenes[(index + 1) % scenes.length] });
  },
  setScene: (scene) => set({ scene }),
  setOverlay: (overlay) => set({ overlay }),
  setListening: (isListening) => set({ isListening }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
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
