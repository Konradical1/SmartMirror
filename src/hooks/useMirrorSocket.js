import { useEffect } from 'react';
import { useMirrorStore } from '../store/useMirrorStore.js';

export function useMirrorSocket() {
  const applyAction = useMirrorStore((state) => state.applyAction);
  const applyDataUpdate = useMirrorStore((state) => state.applyDataUpdate);
  const showSpeech = useMirrorStore((state) => state.showSpeech);
  const setListening = useMirrorStore((state) => state.setListening);
  const applyVoiceStatus = useMirrorStore((state) => state.applyVoiceStatus);

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let closed = false;

    const connect = () => {
      const configuredUrl = import.meta.env.VITE_MIRROR_WS_URL;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const devUrl = `${protocol}//${window.location.hostname}:3001`;
      const defaultUrl = `${protocol}//${window.location.host}`;
      socket = new WebSocket(configuredUrl || (import.meta.env.DEV ? devUrl : defaultUrl));

      socket.addEventListener('open', () => setListening(false));
      socket.addEventListener('close', () => {
        setListening(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 2500);
      });
      socket.addEventListener('error', () => setListening(false));
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'ACTION') applyAction(message.payload);
          if (message.type === 'DATA_UPDATE') applyDataUpdate(message.payload);
          if (message.type === 'OVERLAY') showSpeech(message.payload?.speech || message.payload?.text, message.payload);
          if (message.type === 'VOICE_STATUS') applyVoiceStatus(message.payload);
        } catch {
          // Ignore malformed local dev messages.
        }
      });
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [applyAction, applyDataUpdate, applyVoiceStatus, setListening, showSpeech]);
}
