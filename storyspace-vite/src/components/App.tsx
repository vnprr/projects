import { Ambient } from './Ambient';
import { CanvasView } from './CanvasView';
import { DepthRail } from './DepthRail';
import { NoteView } from './NoteView';
import { useVisualViewportHeight } from '../hooks/useVisualViewport';
import { useNavigation } from '../state/navigation';

export function App() {
  const { state } = useNavigation();
  const viewportHeight = useVisualViewportHeight();

  return (
    <main
      className={`app level-${state.currentLevel}`}
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <Ambient />
      <DepthRail />
      {state.currentLevel !== 'note' && <CanvasView mode={state.currentLevel} />}
      {state.currentLevel === 'note' && <NoteView />}
    </main>
  );
}
