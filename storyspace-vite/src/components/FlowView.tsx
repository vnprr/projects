import { useEffect, useMemo } from 'react';
import { useFlowMotion } from '../hooks/useFlowMotion';
import { usePinch } from '../hooks/useGestures';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

export function FlowView() {
  const { project } = useProject();
  const { state, goToNode, goBack, setBranchIndex, setLevel } = useNavigation();
  const current = project.nodes.find((node) => node.id === state.currentNodeId) ?? project.nodes[0]!;

  const outgoing = useMemo(
    () => project.edges
      .filter((edge) => edge.from === current.id)
      .map((edge) => ({ edge, node: project.nodes.find((node) => node.id === edge.to) }))
      .filter((item): item is { edge: (typeof project.edges)[number]; node: (typeof project.nodes)[number] } => Boolean(item.node)),
    [project.edges, project.nodes, current.id],
  );

  const incoming = useMemo(
    () => project.edges
      .filter((edge) => edge.to === current.id)
      .map((edge) => project.nodes.find((node) => node.id === edge.from))
      .filter((node): node is (typeof project.nodes)[number] => Boolean(node)),
    [project.edges, project.nodes, current.id],
  );

  const previousFromHistory = state.history.at(-1);
  const previous = project.nodes.find((node) => node.id === previousFromHistory) ?? incoming[0] ?? null;
  const selectedIndex = Math.min(state.branchIndex, Math.max(0, outgoing.length - 1));
  const selectedNext = outgoing[selectedIndex];

  const goNext = () => {
    if (selectedNext) goToNode(selectedNext.node.id);
  };

  const goPrevious = () => {
    if (state.history.length) goBack();
    else if (previous) goToNode(previous.id);
  };

  const cycleBranch = (delta: number) => {
    if (outgoing.length < 2) return;
    setBranchIndex((selectedIndex + delta + outgoing.length) % outgoing.length);
  };

  const motion = useFlowMotion({
    canNext: Boolean(selectedNext),
    canPrevious: Boolean(previous),
    canBranch: outgoing.length > 1,
    onNext: goNext,
    onPrevious: goPrevious,
    onBranch: cycleBranch,
    onZoomIn: () => setLevel('note'),
    onZoomOut: () => setLevel('canvas'),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLevel('canvas');
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        setLevel('note');
        return;
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        event.preventDefault();
        motion.commitNext();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        event.preventDefault();
        motion.commitPrevious();
        return;
      }
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
        event.preventDefault();
        motion.nudgeBranch(-1);
        return;
      }
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
        event.preventDefault();
        motion.nudgeBranch(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const pinch = usePinch({
    threshold: 0.16,
    onZoomIn: () => setLevel('note'),
    onZoomOut: () => setLevel('canvas'),
  });

  return (
    <section
      className={`scene flow-scene motion-${state.motion}`}
      {...motion.bind}
      {...pinch}
      aria-label="Story flow"
    >
      <div className="flow-orbit" aria-hidden="true" />

      <div ref={motion.trackRef} className="flow-track">
        {previous && (
          <button
            className="flow-neighbor flow-previous"
            onClick={() => motion.canActivate() && motion.commitPrevious()}
          >
            <span>before</span>
            <strong>{previous.title}</strong>
          </button>
        )}

        <article
          className="flow-current"
          onClick={() => motion.canActivate() && setLevel('note')}
        >
          <div className="flow-meta">
            <span>{project.nodes.findIndex((node) => node.id === current.id) + 1}</span>
            <i />
            <span>{project.nodes.length}</span>
          </div>
          <h1>{current.title}</h1>
          <p>{current.text}</p>
          <div className="flow-enter">tap to write</div>
        </article>

        <div className={`flow-next ${outgoing.length > 1 ? 'has-branches' : ''}`}>
          {outgoing.map(({ edge, node }, index) => (
            <button
              key={edge.id}
              className={`flow-neighbor flow-next-item branch-${index + 1} ${selectedIndex === index ? 'is-selected' : ''}`}
              onPointerDown={() => setBranchIndex(index)}
              onMouseEnter={() => setBranchIndex(index)}
              onClick={() => motion.canActivate() && motion.commitNext()}
            >
              <span>{outgoing.length > 1 ? `path ${index + 1}` : 'next'}</span>
              <strong>{node.title}</strong>
              {outgoing.length > 1 && <small>{node.text.slice(0, 72)}…</small>}
            </button>
          ))}
        </div>
      </div>

      <div className="flow-hint">
        <span className="desktop-hint">drag / trackpad / arrows · enter to write · esc for map</span>
        <span className="mobile-hint">drag naturally · flick to move · tap to write</span>
      </div>
    </section>
  );
}
