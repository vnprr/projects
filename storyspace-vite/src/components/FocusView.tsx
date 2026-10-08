import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent, type WheelEvent } from 'react';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';
import './focus.css';

type EdgePath = { id: string; d: string; kind: 'parent' | 'child' };
type Gesture = { distance: number; lastRatio: number };
const getDistance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function FocusView() {
  const { project } = useProject();
  const { state, goToNode, setLevel } = useNavigation();
  const current = project.nodes.find((node) => node.id === state.currentNodeId) ?? project.nodes[0]!;
  const incoming = useMemo(() => project.edges
    .filter((edge) => edge.to === current.id)
    .map((edge) => project.nodes.find((node) => node.id === edge.from))
    .filter((node): node is (typeof project.nodes)[number] => Boolean(node)),
    [current.id, project.edges, project.nodes]);
  const outgoing = useMemo(() => project.edges
    .filter((edge) => edge.from === current.id)
    .map((edge) => project.nodes.find((node) => node.id === edge.to))
    .filter((node): node is (typeof project.nodes)[number] => Boolean(node)),
    [current.id, project.edges, project.nodes]);

  const stageRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLButtonElement>(null);
  const parentRefs = useRef(new Map<string, HTMLButtonElement>());
  const childRefs = useRef(new Map<string, HTMLButtonElement>());
  const [edgePaths, setEdgePaths] = useState<EdgePath[]>([]);
  const pinchRef = useRef<Gesture | null>(null);
  const [pinchRatio, setPinchRatio] = useState(1);
  const wheelBuffer = useRef(0);
  const wheelTimer = useRef<number | null>(null);
  const [transitionLocked, setTransitionLocked] = useState(false);
  const lockTimer = useRef<number | null>(null);

  const changeLevel = (direction: 'in' | 'out') => {
    if (transitionLocked) return;
    setTransitionLocked(true);
    setLevel(direction === 'in' ? 'note' : 'canvas');
  };

  useLayoutEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      const center = centerRef.current;
      if (!stage || !center) return;
      const origin = stage.getBoundingClientRect();
      const central = center.getBoundingClientRect();
      const middleTop = { x: central.left + central.width / 2 - origin.left, y: central.top - origin.top };
      const middleBottom = { x: middleTop.x, y: central.bottom - origin.top };

      const make = (id: string, node: HTMLButtonElement, kind: 'parent' | 'child') => {
        const rect = node.getBoundingClientRect();
        const start = kind === 'parent'
          ? { x: rect.left + rect.width / 2 - origin.left, y: rect.bottom - origin.top }
          : middleBottom;
        const end = kind === 'parent'
          ? middleTop
          : { x: rect.left + rect.width / 2 - origin.left, y: rect.top - origin.top };
        const dy = Math.max(0, end.y - start.y);
        const bend = clamp(dy * 0.48, 12, 64);
        const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${start.x.toFixed(1)} ${(start.y + bend).toFixed(1)} ${end.x.toFixed(1)} ${(end.y - bend).toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
        return { id, d, kind } satisfies EdgePath;
      };
      const updated: EdgePath[] = [];
      incoming.forEach((node) => {
        const ref = parentRefs.current.get(node.id);
        if (ref) updated.push(make(node.id, ref, 'parent'));
      });
      outgoing.forEach((node) => {
        const ref = childRefs.current.get(node.id);
        if (ref) updated.push(make(node.id, ref, 'child'));
      });
      setEdgePaths(updated);
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    if (centerRef.current) observer.observe(centerRef.current);
    for (const node of parentRefs.current.values()) observer.observe(node);
    for (const node of childRefs.current.values()) observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [current.id, incoming, outgoing]);

  useEffect(() => {
    const onKeyboard = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Enter') { event.preventDefault(); changeLevel('in'); }
      if (event.key === 'Escape') { event.preventDefault(); changeLevel('out'); }
      if (event.key === 'ArrowUp' && incoming[0]) { event.preventDefault(); goToNode(incoming[0].id, 'backward'); }
      if (event.key === 'ArrowDown' && outgoing[0]) { event.preventDefault(); goToNode(outgoing[0].id); }
      if (event.key === 'ArrowRight' && outgoing[1]) { event.preventDefault(); goToNode(outgoing[1].id); }
      if (event.key === 'ArrowLeft' && outgoing[0]) { event.preventDefault(); goToNode(outgoing[0].id); }
    };
    window.addEventListener('keydown', onKeyboard);
    return () => window.removeEventListener('keydown', onKeyboard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, incoming, outgoing, goToNode, setLevel]);

  useEffect(() => () => {
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    if (lockTimer.current) clearTimeout(lockTimer.current);
  }, []);

  const onWheel = (event: WheelEvent<HTMLElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    wheelBuffer.current += clamp(event.deltaY, -65, 65);
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    if (Math.abs(wheelBuffer.current) > 92) {
      const direction = wheelBuffer.current > 0 ? 'out' : 'in';
      wheelBuffer.current = 0;
      changeLevel(direction);
    }
    wheelTimer.current = window.setTimeout(() => { wheelBuffer.current = 0; }, 165);
  };

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 2) return;
    const a = event.touches.item(0);
    const b = event.touches.item(1);
    if (!a || !b) return;
    pinchRef.current = { distance: getDistance(a, b), lastRatio: 1 };
  };
  const onTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (!pinchRef.current || event.touches.length !== 2) return;
    const a = event.touches.item(0);
    const b = event.touches.item(1);
    if (!a || !b) return;
    event.preventDefault();
    const ratio = clamp(getDistance(a, b) / Math.max(1, pinchRef.current.distance), 0.7, 1.35);
    pinchRef.current.lastRatio = ratio;
    setPinchRatio(ratio);
  };
  const onTouchEnd = () => {
    const gesture = pinchRef.current;
    if (!gesture) return;
    pinchRef.current = null;
    const ratio = gesture.lastRatio;
    if (ratio > 1.16) changeLevel('in');
    else if (ratio < .85) changeLevel('out');
    else setPinchRatio(1);
  };

  const bodyPreview = current.text.trim();
  const preview = bodyPreview.length > 460 ? `${bodyPreview.slice(0, 460).trimEnd()}…` : bodyPreview;
  const stageStyle = { '--focus-pinch-scale': String(pinchRatio) } as CSSProperties;

  return (
    <section className="scene focus-scene" onWheel={onWheel} onTouchStart={onTouchStart}
      onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={() => { pinchRef.current = null; setPinchRatio(1); }}>
      <div className="focus-context-heading" aria-hidden="true">{project.title}<span className="focus-context-dot" />focus</div>
      <button className="focus-map-action" aria-label="View project map" onClick={() => changeLevel('out')}>
        <span className="focus-map-icon" aria-hidden="true">⌗</span><span>MAP</span>
      </button>

      <div className="focus-stage" ref={stageRef} style={stageStyle}>
        <svg className="focus-links" aria-hidden="true">
          {edgePaths.map((edge) => <path key={`${edge.kind}:${edge.id}`} d={edge.d} />)}
        </svg>

        <div className="focus-parents">
          {incoming.length ? incoming.map((parent, index) => (
            <button
              className="focus-neighbor focus-neighbor-parent"
              key={parent.id}
              ref={(element) => { if (element) parentRefs.current.set(parent.id, element); else parentRefs.current.delete(parent.id); }}
              onClick={() => goToNode(parent.id, 'backward')}
              aria-label={`Go to previous note: ${parent.title}`}
            >
              <span className="focus-neighbor-meta">{incoming.length > 1 ? `FROM ${index + 1}` : 'PREVIOUS'}</span>
              <strong>{parent.title || 'Untitled'}</strong>
            </button>
          )) : <span className="focus-origin-mark">BEGINNING</span>}
        </div>

        <button
          key={current.id}
          className={`focus-document focus-enter-${state.motion === 'backward' ? 'backward' : 'forward'}`}
          ref={centerRef}
          onClick={() => changeLevel('in')}
          aria-label={`Open note for editing: ${current.title}`}
        >
          <div className="focus-document-top"><span className="focus-document-mark" /><span>{String(project.nodes.indexOf(current) + 1).padStart(2, '0')} / {String(project.nodes.length).padStart(2, '0')}</span></div>
          <div className="focus-document-copy">
            <h1>{current.title || 'Untitled'}</h1>
            {preview ? <p>{preview}</p> : <p className="focus-placeholder">A quiet place to begin writing.</p>}
          </div>
          <div className="focus-document-bottom">
            <span>{outgoing.length > 1 ? `${outgoing.length} possible paths` : outgoing.length === 1 ? 'continues below' : 'end of path'}</span>
            <span className="focus-open-writing">OPEN TO WRITE <span aria-hidden="true">↗</span></span>
          </div>
        </button>

        <div className="focus-children">
          {outgoing.length ? outgoing.map((child, index) => (
            <button
              className="focus-neighbor focus-neighbor-child"
              key={child.id}
              ref={(element) => { if (element) childRefs.current.set(child.id, element); else childRefs.current.delete(child.id); }}
              onClick={() => goToNode(child.id, 'forward')}
              aria-label={`Go to next note: ${child.title}`}
            >
              <span className="focus-neighbor-meta">{outgoing.length > 1 ? `PATH ${String(index + 1).padStart(2, '0')}` : 'NEXT'}</span>
              <strong>{child.title || 'Untitled'}</strong>
            </button>
          )) : <span className="focus-end-mark">END OF PATH</span>}
        </div>
      </div>
      <div className="focus-hint" aria-hidden="true">PINCH TO EXPLORE · TAP TO FOLLOW</div>
    </section>
  );
}
