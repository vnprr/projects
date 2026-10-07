import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePinch } from '../hooks/useGestures';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';
import './noteFlow.css';

type Phase = 'idle' | 'leaving' | 'entering';
type TravelDirection = 'next' | 'previous';
type EdgeDirection = 'top' | 'bottom' | null;

type WheelSession = {
  active: boolean;
  edge: EdgeDirection;
  pull: number;
};

type TouchSession = {
  startY: number;
  atTop: boolean;
  atBottom: boolean;
  direction: EdgeDirection;
  pull: number;
};

const WHEEL_THRESHOLD = 172;
const TOUCH_THRESHOLD = 104;
const WHEEL_GAP_MS = 150;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function NoteView() {
  const { project, updateNodeContent, createNodeAfter, linkExistingNode } = useProject();
  const { state, setLevel, goToNode, goBack } = useNavigation();
  const node = project.nodes.find((item) => item.id === state.currentNodeId) ?? project.nodes[0]!;

  const [title, setTitle] = useState(node.title);
  const [text, setText] = useState(node.text);
  const [phase, setPhase] = useState<Phase>('idle');
  const [travelDirection, setTravelDirection] = useState<TravelDirection>('next');
  const [edgeState, setEdgeState] = useState({ top: true, bottom: false });
  const [gate, setGate] = useState<{ direction: EdgeDirection; progress: number }>({ direction: null, progress: 0 });
  const [branchOpen, setBranchOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ nodeId: node.id, title: node.title, text: node.text });
  const transitionTimers = useRef<number[]>([]);
  const wheelSession = useRef<WheelSession>({ active: false, edge: null, pull: 0 });
  const wheelEndTimer = useRef<number | null>(null);
  const wheelLockUntil = useRef(0);
  const touchSession = useRef<TouchSession | null>(null);
  const enterFromRef = useRef<TravelDirection>('next');

  const outgoing = useMemo(() => project.edges
    .filter((edge) => edge.from === node.id)
    .map((edge) => ({ edge, node: project.nodes.find((item) => item.id === edge.to) }))
    .filter((item): item is { edge: (typeof project.edges)[number]; node: (typeof project.nodes)[number] } => Boolean(item.node)),
  [node.id, project.edges, project.nodes]);

  const incoming = useMemo(() => project.edges
    .filter((edge) => edge.to === node.id)
    .map((edge) => project.nodes.find((item) => item.id === edge.from))
    .filter((item): item is (typeof project.nodes)[number] => Boolean(item)),
  [node.id, project.edges, project.nodes]);

  const historyPreviousId = state.history.at(-1);
  const previousNode = incoming.find((item) => item.id === historyPreviousId) ?? incoming[0] ?? null;
  const soleNext = outgoing.length === 1 ? outgoing[0]?.node ?? null : null;

  const flush = useCallback(() => {
    const value = latest.current;
    updateNodeContent(value.nodeId, value.title, value.text);
  }, [updateNodeContent]);

  const readEdges = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return { top: true, bottom: true };

    return {
      top: element.scrollTop <= 2,
      bottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
    };
  }, []);

  const syncEdges = useCallback(() => {
    const next = readEdges();
    setEdgeState((current) => (
      current.top === next.top && current.bottom === next.bottom ? current : next
    ));

    if (!next.bottom) setBranchOpen(false);
  }, [readEdges]);

  const resetGate = useCallback(() => {
    setGate({ direction: null, progress: 0 });
  }, []);

  useLayoutEffect(() => {
    setTitle(node.title);
    setText(node.text);
    latest.current = { nodeId: node.id, title: node.title, text: node.text };
    setBranchOpen(false);
    setLinkPickerOpen(false);
    resetGate();
    wheelSession.current = { active: false, edge: null, pull: 0 };
    touchSession.current = null;

    const direction = enterFromRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = scrollRef.current;
        if (!element) return;

        if (direction === 'previous') {
          element.scrollTo({ top: element.scrollHeight });
        } else {
          element.scrollTo({ top: 0 });
        }

        syncEdges();
      });
    });
  // node.id is the document boundary; persistence updates must not reset scroll while typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useLayoutEffect(() => {
    const textarea = textRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(150, textarea.scrollHeight)}px`;
    requestAnimationFrame(syncEdges);
  }, [node.id, syncEdges, text]);

  useEffect(() => {
    latest.current = { nodeId: node.id, title, text };
    const timer = window.setTimeout(flush, 420);
    return () => window.clearTimeout(timer);
  }, [flush, node.id, text, title]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [flush]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLevel('canvas');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setLevel]);

  useEffect(() => () => {
    transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
    if (wheelEndTimer.current) window.clearTimeout(wheelEndTimer.current);
  }, []);

  const startTransition = useCallback((direction: TravelDirection, action: () => void) => {
    if (phase !== 'idle') return;

    flush();
    setTravelDirection(direction);
    setPhase('leaving');
    setBranchOpen(false);
    resetGate();
    wheelSession.current = { active: false, edge: null, pull: 0 };
    wheelLockUntil.current = performance.now() + 520;
    enterFromRef.current = direction;

    const leave = window.setTimeout(() => {
      action();
      setPhase('entering');

      const enter = window.setTimeout(() => {
        setPhase('idle');
        wheelLockUntil.current = performance.now() + 180;
      }, 300);

      transitionTimers.current.push(enter);
    }, 170);

    transitionTimers.current.push(leave);
  }, [flush, phase, resetGate]);

  const navigateForward = useCallback((nodeId: string) => {
    startTransition('next', () => goToNode(nodeId));
  }, [goToNode, startTransition]);

  const navigatePrevious = useCallback(() => {
    if (!previousNode) return;

    const canUseHistory = state.history.at(-1) === previousNode.id;
    startTransition('previous', () => {
      if (canUseHistory) goBack();
      else goToNode(previousNode.id);
    });
  }, [goBack, goToNode, previousNode, startTransition, state.history]);

  const resolveBottomGate = useCallback((progress: number) => {
    if (progress < 1) {
      resetGate();
      return;
    }

    if (soleNext) {
      navigateForward(soleNext.id);
      return;
    }

    if (outgoing.length > 1) {
      setBranchOpen(true);
      resetGate();
      return;
    }

    resetGate();
  }, [navigateForward, outgoing.length, resetGate, soleNext]);

  const resolveTopGate = useCallback((progress: number) => {
    if (progress >= 1 && previousNode) navigatePrevious();
    else resetGate();
  }, [navigatePrevious, previousNode, resetGate]);

  const finishWheelSessionSoon = useCallback(() => {
    if (wheelEndTimer.current) window.clearTimeout(wheelEndTimer.current);

    wheelEndTimer.current = window.setTimeout(() => {
      const session = wheelSession.current;
      wheelSession.current = { active: false, edge: null, pull: 0 };
      wheelEndTimer.current = null;

      if (phase !== 'idle') {
        resetGate();
        return;
      }

      const progress = clamp01(session.pull / WHEEL_THRESHOLD);
      if (session.edge === 'bottom') resolveBottomGate(progress);
      else if (session.edge === 'top') resolveTopGate(progress);
      else resetGate();
    }, WHEEL_GAP_MS);
  }, [phase, resetGate, resolveBottomGate, resolveTopGate]);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (performance.now() < wheelLockUntil.current || phase !== 'idle') {
      event.preventDefault();
      finishWheelSessionSoon();
      return;
    }

    if (!wheelSession.current.active) {
      const edges = readEdges();
      const edge: EdgeDirection =
        event.deltaY > 0 && edges.bottom && outgoing.length > 0
          ? 'bottom'
          : event.deltaY < 0 && edges.top && previousNode
            ? 'top'
            : null;

      wheelSession.current = { active: true, edge, pull: 0 };
    }

    const session = wheelSession.current;

    if (session.edge === 'bottom' && event.deltaY > 0) {
      event.preventDefault();
      session.pull += Math.min(54, Math.abs(event.deltaY));
      setGate({
        direction: 'bottom',
        progress: clamp01(session.pull / WHEEL_THRESHOLD),
      });
    } else if (session.edge === 'top' && event.deltaY < 0) {
      event.preventDefault();
      session.pull += Math.min(54, Math.abs(event.deltaY));
      setGate({
        direction: 'top',
        progress: clamp01(session.pull / WHEEL_THRESHOLD),
      });
    }

    finishWheelSessionSoon();
  };

  const createContinuation = useCallback(() => {
    const created = createNodeAfter(node.id);
    navigateForward(created.id);
  }, [createNodeAfter, navigateForward, node.id]);

  const linkCandidates = useMemo(() => {
    const linked = new Set(outgoing.map(({ node: nextNode }) => nextNode.id));
    return project.nodes.filter((candidate) => candidate.id !== node.id && !linked.has(candidate.id));
  }, [node.id, outgoing, project.nodes]);

  const connectExisting = useCallback((targetId: string) => {
    const linked = linkExistingNode(node.id, targetId);
    if (!linked) return;
    setLinkPickerOpen(false);
    setBranchOpen(true);
  }, [linkExistingNode, node.id]);

  const pinch = usePinch({ onZoomOut: () => setLevel('canvas') });
  const easedPull = 1 - Math.pow(1 - gate.progress, 2.2);
  const signedPull = gate.direction === 'bottom'
    ? -easedPull * 54
    : gate.direction === 'top'
      ? easedPull * 54
      : 0;

  const sceneStyle = {
    '--note-pull-offset': `${signedPull}px`,
    '--note-pull-progress': String(gate.progress),
    '--note-pull-angle': `${Math.round(gate.progress * 360)}deg`,
  } as CSSProperties;

  return (
    <section
      className={`scene note-scene note-travel-${travelDirection} edge-pull-${gate.direction ?? 'none'}`}
      style={sceneStyle}
      {...pinch}
    >
      <button
        className="note-back"
        onClick={() => {
          flush();
          setLevel('canvas');
        }}
        aria-label="Back to graph"
      >
        <span />
      </button>

      {previousNode && (
        <div className={`note-edge note-edge-top ${edgeState.top || gate.direction === 'top' ? 'is-visible' : ''}`}>
          <button onClick={navigatePrevious}>
            <span className="note-gate-ring" aria-hidden="true" />
            <span className="note-edge-copy">
              <small>{gate.direction === 'top' ? (gate.progress >= 1 ? 'release' : 'pull') : 'previous'}</small>
              <strong>{previousNode.title || 'Untitled'}</strong>
            </span>
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className={`note-scroll note-phase-${phase}`}
        onScroll={syncEdges}
        onWheel={handleWheel}
        onTouchStartCapture={(event) => {
          if (event.touches.length !== 1 || phase !== 'idle') return;
          const touch = event.touches.item(0);
          if (!touch) return;

          const edges = readEdges();
          touchSession.current = {
            startY: touch.clientY,
            atTop: edges.top,
            atBottom: edges.bottom,
            direction: null,
            pull: 0,
          };
        }}
        onTouchMoveCapture={(event) => {
          const touch = event.touches.item(0);
          const gesture = touchSession.current;
          if (!touch || !gesture || phase !== 'idle') return;

          const dy = touch.clientY - gesture.startY;

          if (gesture.atBottom && dy < 0 && outgoing.length > 0) {
            event.preventDefault();
            gesture.direction = 'bottom';
            gesture.pull = -dy;
            setGate({
              direction: 'bottom',
              progress: clamp01(gesture.pull / TOUCH_THRESHOLD),
            });
            return;
          }

          if (gesture.atTop && dy > 0 && previousNode) {
            event.preventDefault();
            gesture.direction = 'top';
            gesture.pull = dy;
            setGate({
              direction: 'top',
              progress: clamp01(gesture.pull / TOUCH_THRESHOLD),
            });
          }
        }}
        onTouchEndCapture={() => {
          const gesture = touchSession.current;
          touchSession.current = null;

          if (!gesture || phase !== 'idle') {
            resetGate();
            return;
          }

          const progress = clamp01(gesture.pull / TOUCH_THRESHOLD);
          if (gesture.direction === 'bottom') resolveBottomGate(progress);
          else if (gesture.direction === 'top') resolveTopGate(progress);
          else resetGate();
        }}
        onTouchCancelCapture={() => {
          touchSession.current = null;
          resetGate();
        }}
      >
        <div className="note-document" key={node.id}>
          <div className="note-paper">
            <input
              className="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  textRef.current?.focus();
                }
              }}
              enterKeyHint="next"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              aria-label="Note title"
            />

            <textarea
              ref={textRef}
              className="note-body"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write…"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              aria-label="Note text"
            />
          </div>
        </div>
      </div>

      <div
        className={[
          'note-edge',
          'note-edge-bottom',
          edgeState.bottom || gate.direction === 'bottom' ? 'is-visible' : '',
          outgoing.length > 1 ? 'has-branches' : '',
          branchOpen ? 'is-open' : '',
        ].filter(Boolean).join(' ')}
      >
        {soleNext ? (
          <div className="note-edge-row">
            <button className="note-edge-single" onClick={() => navigateForward(soleNext.id)}>
              <span className="note-gate-ring" aria-hidden="true" />
              <span className="note-edge-copy">
                <small>{gate.direction === 'bottom' ? (gate.progress >= 1 ? 'release' : 'pull') : 'next'}</small>
                <strong>{soleNext.title || 'Untitled'}</strong>
              </span>
              <span className="note-edge-arrow" />
            </button>
            <button className="note-path-add" onClick={createContinuation} aria-label="Add another path">+</button>
          </div>
        ) : outgoing.length > 1 && branchOpen ? (
          <div className="note-edge-branches">
            <div className="note-edge-branch-label">
              <span>choose next</span>
              <button onClick={createContinuation}>+ path</button>
              <button onClick={() => setLinkPickerOpen((value) => !value)}>link</button>
            </div>
            {outgoing.map(({ edge, node: nextNode }, index) => (
              <button key={edge.id} onClick={() => navigateForward(nextNode.id)}>
                <small>path {index + 1}</small>
                <strong>{nextNode.title || 'Untitled'}</strong>
              </button>
            ))}
          </div>
        ) : outgoing.length > 1 ? (
          <button className="note-edge-single note-edge-branch-trigger" onClick={() => setBranchOpen(true)}>
            <span className="note-gate-ring" aria-hidden="true" />
            <span className="note-edge-copy">
              <small>{gate.direction === 'bottom' ? (gate.progress >= 1 ? 'release' : 'pull') : `${outgoing.length} paths`}</small>
              <strong>Choose where the story goes</strong>
            </span>
            <span className="note-edge-arrow" />
          </button>
        ) : (
          <div className="note-edge-empty">
            <button className="note-create-path" onClick={createContinuation}>
              <span>+</span>
              <strong>Continue the story</strong>
            </button>
            <button className="note-link-path" onClick={() => setLinkPickerOpen((value) => !value)}>link existing</button>
          </div>
        )}

        {linkPickerOpen && linkCandidates.length > 0 && (
          <div className="note-link-picker">
            <small>link this note to</small>
            <div>
              {linkCandidates.slice(0, 8).map((candidate) => (
                <button key={candidate.id} onClick={() => connectExisting(candidate.id)}>
                  {candidate.title || 'Untitled'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
