import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePinch } from '../hooks/useGestures';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';
import './noteFlow.css';

type Phase = 'idle' | 'leaving' | 'entering';
type TravelDirection = 'next' | 'previous';
type EdgeDirection = 'top' | 'bottom' | null;

type GateState = {
  direction: EdgeDirection;
  progress: number;
  armed: boolean;
};

type WheelSession = {
  active: boolean;
  edge: EdgeDirection;
  pull: number;
  armed: boolean;
};

type TouchSession = {
  startY: number;
  atTop: boolean;
  atBottom: boolean;
  direction: EdgeDirection;
  pull: number;
  armed: boolean;
};

const WHEEL_THRESHOLD = 176;
const TOUCH_THRESHOLD = 106;
const DISARM_RATIO = 0.68;
const WHEEL_GAP_MS = 155;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  const [gate, setGate] = useState<GateState>({ direction: null, progress: 0, armed: false });
  const [branchOpen, setBranchOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ nodeId: node.id, title: node.title, text: node.text });
  const transitionTimers = useRef<number[]>([]);
  const wheelSession = useRef<WheelSession>({ active: false, edge: null, pull: 0, armed: false });
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

    if (!next.bottom) {
      setBranchOpen(false);
      setLinkPickerOpen(false);
    }
  }, [readEdges]);

  const resetGate = useCallback(() => {
    setGate({ direction: null, progress: 0, armed: false });
  }, []);

  useLayoutEffect(() => {
    setTitle(node.title);
    setText(node.text);
    latest.current = { nodeId: node.id, title: node.title, text: node.text };
    setBranchOpen(false);
    setLinkPickerOpen(false);
    resetGate();
    wheelSession.current = { active: false, edge: null, pull: 0, armed: false };
    touchSession.current = null;

    const direction = enterFromRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = scrollRef.current;
        if (!element) return;

        element.scrollTo({ top: direction === 'previous' ? element.scrollHeight : 0 });
        syncEdges();
      });
    });
  // node.id is the document boundary; persistence updates must not reset scroll while typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useLayoutEffect(() => {
    const textarea = textRef.current;
    if (textarea) {
      textarea.style.height = '0px';
      textarea.style.height = `${Math.max(150, textarea.scrollHeight)}px`;
    }

    const titleArea = titleRef.current;
    if (titleArea) {
      titleArea.style.height = '0px';
      titleArea.style.height = `${Math.max(46, titleArea.scrollHeight)}px`;
    }

    requestAnimationFrame(syncEdges);
  }, [node.id, syncEdges, text, title]);

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
    setLinkPickerOpen(false);
    resetGate();
    wheelSession.current = { active: false, edge: null, pull: 0, armed: false };
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

  const resolveBottomGate = useCallback((armed: boolean) => {
    if (!armed) {
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

  const resolveTopGate = useCallback((armed: boolean) => {
    if (armed && previousNode) navigatePrevious();
    else resetGate();
  }, [navigatePrevious, previousNode, resetGate]);

  const updateGateFromPull = useCallback((
    direction: Exclude<EdgeDirection, null>,
    pull: number,
    threshold: number,
    wasArmed: boolean,
  ) => {
    let armed = wasArmed;
    if (!armed && pull >= threshold) armed = true;
    if (armed && pull < threshold * DISARM_RATIO) armed = false;

    setGate({
      direction,
      progress: clamp(pull / threshold, 0, 1.35),
      armed,
    });

    return armed;
  }, []);

  const finishWheelSessionSoon = useCallback(() => {
    if (wheelEndTimer.current) window.clearTimeout(wheelEndTimer.current);

    wheelEndTimer.current = window.setTimeout(() => {
      const session = wheelSession.current;
      wheelSession.current = { active: false, edge: null, pull: 0, armed: false };
      wheelEndTimer.current = null;

      if (phase !== 'idle') {
        resetGate();
        return;
      }

      if (session.edge === 'bottom') resolveBottomGate(session.armed);
      else if (session.edge === 'top') resolveTopGate(session.armed);
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

      wheelSession.current = { active: true, edge, pull: 0, armed: false };
    }

    const session = wheelSession.current;

    if (session.edge === 'bottom' && event.deltaY > 0) {
      event.preventDefault();
      session.pull += Math.min(52, Math.abs(event.deltaY));
      session.armed = updateGateFromPull('bottom', session.pull, WHEEL_THRESHOLD, session.armed);
    } else if (session.edge === 'top' && event.deltaY < 0) {
      event.preventDefault();
      session.pull += Math.min(52, Math.abs(event.deltaY));
      session.armed = updateGateFromPull('top', session.pull, WHEEL_THRESHOLD, session.armed);
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

  const visualProgress = Math.min(1, gate.progress);
  const basePull = 1 - Math.pow(1 - visualProgress, 2.15);
  const overPull = Math.max(0, gate.progress - 1);
  const pullDistance = basePull * 52 + overPull * 18;
  const signedPull = gate.direction === 'bottom'
    ? -pullDistance
    : gate.direction === 'top'
      ? pullDistance
      : 0;

  const sceneStyle = {
    '--note-pull-offset': `${signedPull}px`,
    '--note-pull-progress': String(visualProgress),
    '--note-pull-angle': `${Math.round(visualProgress * 360)}deg`,
  } as CSSProperties;

  return (
    <section
      className={[
        'scene',
        'note-scene',
        `note-travel-${travelDirection}`,
        `edge-pull-${gate.direction ?? 'none'}`,
        gate.armed ? 'gate-armed' : '',
      ].filter(Boolean).join(' ')}
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
        <span className="note-back-node" />
        <span className="note-back-link" />
        <span className="note-back-node" />
      </button>

      {previousNode && (
        <div className={`note-edge note-edge-top ${edgeState.top || gate.direction === 'top' ? 'is-visible' : ''}`}>
          <button onClick={navigatePrevious}>
            <span className="note-gate-ring" aria-hidden="true" />
            <span className="note-edge-copy">
              <small>{gate.direction === 'top' ? (gate.armed ? 'release' : 'pull') : 'previous'}</small>
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
            armed: false,
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
            gesture.armed = updateGateFromPull('bottom', gesture.pull, TOUCH_THRESHOLD, gesture.armed);
            return;
          }

          if (gesture.atTop && dy > 0 && previousNode) {
            event.preventDefault();
            gesture.direction = 'top';
            gesture.pull = dy;
            gesture.armed = updateGateFromPull('top', gesture.pull, TOUCH_THRESHOLD, gesture.armed);
          }
        }}
        onTouchEndCapture={() => {
          const gesture = touchSession.current;
          touchSession.current = null;

          if (!gesture || phase !== 'idle') {
            resetGate();
            return;
          }

          if (gesture.direction === 'bottom') resolveBottomGate(gesture.armed);
          else if (gesture.direction === 'top') resolveTopGate(gesture.armed);
          else resetGate();
        }}
        onTouchCancelCapture={() => {
          touchSession.current = null;
          resetGate();
        }}
      >
        <div className="note-document" key={node.id}>
          <div className="note-paper">
            <textarea
              ref={titleRef}
              rows={1}
              className="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
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
                <small>{gate.direction === 'bottom' ? (gate.armed ? 'release' : 'pull') : 'next'}</small>
                <strong>{soleNext.title || 'Untitled'}</strong>
              </span>
              <span className="note-edge-arrow" />
            </button>
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
              <small>{gate.direction === 'bottom' ? (gate.armed ? 'release' : 'pull') : `${outgoing.length} paths`}</small>
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
