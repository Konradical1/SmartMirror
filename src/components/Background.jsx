import { useMirrorStore } from '../store/useMirrorStore.js';

const tintByScene = {
  idle: 'rgba(0, 229, 255, 0.025)',
  weather: 'rgba(0, 229, 255, 0.055)',
  calendar: 'rgba(104, 224, 131, 0.035)',
  spotify: 'rgba(139, 92, 246, 0.035)',
};

export default function Background() {
  const scene = useMirrorStore((state) => state.scene);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 bg-black">
      <div
        className="absolute inset-[-12%]"
        style={{
          background: [
            `radial-gradient(circle at 24% 18%, ${tintByScene[scene]}, transparent 32%), radial-gradient(circle at 78% 78%, rgba(255,255,255,0.018), transparent 34%)`,
          ].join(', '),
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.24)_72%,rgba(0,0,0,0.88)_100%)]" />
    </div>
  );
}
