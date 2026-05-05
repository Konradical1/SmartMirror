import Background from './components/Background.jsx';
import OverlayLayer from './components/OverlayLayer.jsx';
import SceneRenderer from './components/SceneRenderer.jsx';
import { useDebugKeys } from './hooks/useDebugKeys.js';
import { useMirrorSocket } from './hooks/useMirrorSocket.js';
import { useVoiceSfx } from './hooks/useVoiceSfx.js';

export default function App() {
  useMirrorSocket();
  useVoiceSfx();
  useDebugKeys();

  return (
    <main className="mirror-stage">
      <Background />
      <SceneRenderer />
      <OverlayLayer />
    </main>
  );
}
