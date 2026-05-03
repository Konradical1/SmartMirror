import { useEffect } from 'react';
import { useMirrorStore } from '../store/useMirrorStore.js';

export function useDebugKeys() {
  const cycleScene = useMirrorStore((state) => state.cycleScene);
  const setScene = useMirrorStore((state) => state.setScene);
  const setOverlay = useMirrorStore((state) => state.setOverlay);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === 'd') cycleScene();
      if (event.key === 'Escape') setScene('idle');
      if (event.key.toLowerCase() === 'o') {
        setOverlay({ id: Date.now(), text: 'Here is what I found.' });
        window.setTimeout(() => setOverlay(null), 3000);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cycleScene, setOverlay, setScene]);
}
