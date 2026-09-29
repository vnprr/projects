import { useEffect } from 'react';
import { Ambient } from './Ambient';
import { CanvasView } from './CanvasView';
import { DepthRail } from './DepthRail';
import { NavigatorPanel } from './NavigatorPanel';
import { NoteView } from './NoteView';
import { useVisualViewportHeight } from '../hooks/useVisualViewport';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

export function App() {
  const { state, focusCanvasNode } = useNavigation();
  const { project } = useProject();
  const viewportHeight = useVisualViewportHeight();

  useEffect(() => {
    if (!project.nodes.some((node) => node.id === state.currentNodeId)) {
      focusCanvasNode(project.entryNodeId);
    }
  }, [focusCanvasNode, project.entryNodeId, project.nodes, state.currentNodeId]);

  return (
    <main
      className={`app level-${state.currentLevel}`}
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <Ambient />
      <NavigatorPanel />
      <DepthRail />
      {state.currentLevel !== 'note' && <CanvasView mode={state.currentLevel} />}
      {state.currentLevel === 'note' && <NoteView />}
    </main>
  );
}
