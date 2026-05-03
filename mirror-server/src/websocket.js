import { WebSocketServer } from 'ws';
import { updateUi } from './state.js';
import { logger } from './utils/logger.js';

const clients = new Set();

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    clients.add(socket);
    logger.info(`UI connected (${clients.size})`);

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'UI_STATE') updateUi(message.payload);
      } catch {
        logger.warn('Ignored malformed UI WebSocket message');
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      logger.info(`UI disconnected (${clients.size})`);
    });
  });

  return wss;
}

export function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

export function broadcastAction(intent, data = {}, speech = '') {
  broadcast({
    type: 'ACTION',
    payload: {
      intent,
      data,
      speech,
    },
  });
}

export function broadcastData(payload) {
  broadcast({
    type: 'DATA_UPDATE',
    payload,
  });
}

export function broadcastOverlay(speech) {
  broadcast({
    type: 'OVERLAY',
    payload: {
      speech,
    },
  });
}
