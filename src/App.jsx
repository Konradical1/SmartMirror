import Background from './components/Background.jsx';
import OverlayLayer from './components/OverlayLayer.jsx';
import SceneRenderer from './components/SceneRenderer.jsx';
import { useDebugKeys } from './hooks/useDebugKeys.js';
import { useMirrorSocket } from './hooks/useMirrorSocket.js';

export default function App() {
  useMirrorSocket();
  useDebugKeys();

  return (
    <main className="mirror-stage">
      <Background />
      <SceneRenderer />
      <OverlayLayer />
    </main>
  );
}
