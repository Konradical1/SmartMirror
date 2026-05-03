import { setLastIntent } from '../state.js';
import { broadcastAction } from '../websocket.js';

export async function handleEmail(params = {}, speech = '') {
  setLastIntent('SHOW_EMAIL');
  const responseSpeech = 'Email is not connected yet, sir. One inbox disaster at a time.';
  broadcastAction('IDLE', {}, responseSpeech);
  return { ok: true, speech: responseSpeech };
}
