export const state = {
  currentScene: 'idle',
  lastIntent: null,
  context: {
    weather: null,
    calendar: null,
    spotify: null,
    todos: [],
  },
  ui: {
    scene: 'idle',
  },
};

export function setScene(scene) {
  state.currentScene = scene;
}

export function setLastIntent(intent) {
  state.lastIntent = intent;
}

export function updateContext(key, value) {
  state.context[key] = value;
}

export function updateUi(payload = {}) {
  state.ui = {
    ...state.ui,
    ...payload,
  };
}
