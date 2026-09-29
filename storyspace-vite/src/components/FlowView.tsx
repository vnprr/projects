import { useEffect, useMemo, useRef } from 'react';
import { useSwipe, usePinch } from '../hooks/useGestures';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

export function FlowView() {
  const { project } = useProject();
  const { state, goToNode, goBack, setBranchIndex, setLevel } = useNavigation();
  const wheelAccumulator = useRef(0);
  const wheelLocked = useRef(false);
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

  const next = () => selectedNext && goToNode(selectedNext.node.id);
  const previousStep = () => {
    if (state.history.length) goBack();
    else if (previous) goToNode(previous.id);
  };
  const cycleBranch = (delta: number) => {
    if (outgoing.length < 2) return;
    setBranchIndex((selectedIndex + delta + outgoing.length) % outgoing.length);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return setLevel('canvas');
      if (event.key === 'Enter') return setLevel('note');
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        event.preventDefault(); next();
      } else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        event.preventDefault(); previousStep();
      } else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
        event.preventDefault(); cycleBranch(-1);
      } else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
        event.preventDefault(); cycleBranch(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const swipe = useSwipe({ onLeft: next, onRight: previousStep, onUp: () => cycleBranch(1), onDown: () => cycleBranch(-1) });
  const pinch = usePinch({ onZoomIn: () => setLevel('note'), onZoomOut: () => setLevel('canvas') });

  return (
    <section
      className={`scene flow-scene motion-${state.motion}`}
      {...swipe}
      {...pinch}
      onWheel={(event) => {
        if (wheelLocked.current) return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          setLevel(event.deltaY < 0 ? 'note' : 'canvas');
          return;
        }
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        wheelAccumulator.current += delta;
        if (Math.abs(wheelAccumulator.current) < 76) return;
        event.preventDefault();
        const forward = wheelAccumulator.current > 0;
        wheelAccumulator.current = 0;
        wheelLocked.current = true;
        window.setTimeout(() => (wheelLocked.current = false), 330);
        forward ? next() : previousStep();
      }}
    >
      <div className="flow-orbit" aria-hidden="true" />

      {previous && (
        <button className="flow-neighbor flow-previous" onClick={previousStep}>
          <span>before</span>
          <strong>{previous.title}</strong>
        </button>
      )}

      <article className="flow-current" onClick={() => setLevel('note')}>
        <div className="flow-meta"><span>{project.nodes.findIndex((node) => node.id === current.id) + 1}</span><i /><span>{project.nodes.length}</span></div>
        <h1>{current.title}</h1>
        <p>{current.text}</p>
        <div className="flow-enter">tap to write</div>
      </article>

      <div className={`flow-next ${outgoing.length > 1 ? 'has-branches' : ''}`}>
        {outgoing.map(({ edge, node }, index) => (
          <button
            key={edge.id}
            className={`flow-neighbor flow-next-item branch-${index + 1} ${selectedIndex === index ? 'is-selected' : ''}`}
            onMouseEnter={() => setBranchIndex(index)}
            onClick={() => goToNode(node.id)}
          >
            <span>{outgoing.length > 1 ? `path ${index + 1}` : 'next'}</span>
            <strong>{node.title}</strong>
            {outgoing.length > 1 && <small>{node.text.slice(0, 72)}…</small>}
          </button>
        ))}
      </div>

      <div className="flow-hint"><span className="desktop-hint">scroll / arrows · tap center to write · esc for map</span><span className="mobile-hint">swipe to move · tap to write · pinch for depth</span></div>
    </section>
  );
}
