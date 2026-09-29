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
  edge: 'top' | 'bottom' | 'middle';
  pull: number;
};

type TouchSession = {
  startY: number;
  atTop: boolean;
  atBottom: boolean;
  direction: EdgeDirection;
  pull: number;
};

const EDGE_THRESHOLD = 148;
const TOUCH_THRESHOLD = 112;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function NoteView() {
  const { project, updateNodeContent } = useProject();
  const { state, setLevel, goToNode, goBack } = useNavigation();
  const node = project.nodes.find((item) => item.id === state.currentNodeId) ?? project.nodes[0]!;
  const [title, setTitle] = useState(node.title);
  const [text, setText] = useState(node.text);
  const [phase, setPhase] = useState<Phase>('idle');
  const [travelDirection, setTravelDirection] = useState<TravelDirection>('next');
  const [edgeState, setEdgeState] = useState({ top: true, bottom: false });
  const [edgePull, setEdgePull] = useState<{ direction: EdgeDirection; progress: number }>({ direction: null, progress: 0 });
  const [branchOpen, setBranchOpen] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ nodeId: node.id, title: node.title, text: node.text });
  const transitionTimers = useRef<number[]>([]);
  const wheelSession = useRef<WheelSession>({ active: false, edge: 'middle', pull: 0 });
  const wheelEndTimer = useRef<number | null>(null);
  const wheelBlockedUntilRelease = useRef(false);
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
    setEdgeState((current) => current.top === next.top && current.bottom === next.bottom ? current : next);
    if (!next.bottom) setBranchOpen(false);
  }, [readEdges]);

  const resetEdgePull = useCallback(() => {
    setEdgePull({ direction: null, progress: 0 });
  }, []);

  useLayoutEffect(() => {
    setTitle(node.title);
    setText(node.text);
    latest.current = { nodeId: node.id, title: node.title, text: node.text };
    setBranchOpen(false);
    resetEdgePull();
    wheelSession.current = { active: false, edge: 'middle', pull: 0 };
    touchSession.current = null;

    const direction = enterFromRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = scrollRef.current;
        if (!element) return;
        if (direction === 'previous') element.scrollTo({ top: element.scrollHeight });
        else element.scrollTo({ top: 0 });
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
    textarea.style.height = `${Math.max(180, textarea.scrollHeight)}px`;
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
      if (event.key === 'Escape') setLevel('flow');
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
    resetEdgePull();
    wheelBlockedUntilRelease.current = true;
    enterFromRef.current = direction;

    const leave = window.setTimeout(() => {
      action();
      setPhase('entering');
      const enter = window.setTimeout(() => setPhase('idle'), 320);
      transitionTimers.current.push(enter);
    }, 150);
    transitionTimers.current.push(leave);
  }, [flush, phase, resetEdgePull]);

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

  const finishWheelSessionSoon = () => {
    if (wheelEndTimer.current) window.clearTimeout(wheelEndTimer.current);
    wheelEndTimer.current = window.setTimeout(() => {
      wheelSession.current = { active: false, edge: 'middle', pull: 0 };
      wheelBlockedUntilRelease.current = false;
      resetEdgePull();
      wheelEndTimer.current = null;
    }, 180);
  };

  const handleEdgeWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (phase !== 'idle') {
      event.preventDefault();
      finishWheelSessionSoon();
      return;
    }

    if (wheelBlockedUntilRelease.current) {
      event.preventDefault();
      finishWheelSessionSoon();
      return;
    }

    if (!wheelSession.current.active) {
      const edges = readEdges();
      const edge = event.deltaY < 0 && edges.top
        ? 'top'
        : event.deltaY > 0 && edges.bottom
          ? 'bottom'
          : 'middle';
      wheelSession.current = { active: true, edge, pull: 0 };
    }

    const session = wheelSession.current;
    finishWheelSessionSoon();

    if (session.edge === 'bottom' && event.deltaY > 0) {
      event.preventDefault();
      session.pull += event.deltaY;
      const progress = clamp01(session.pull / EDGE_THRESHOLD);
      setEdgePull({ direction: 'bottom', progress });

      if (outgoing.length > 1) {
        if (progress > 0.58) setBranchOpen(true);
        return;
      }

      if (soleNext && session.pull >= EDGE_THRESHOLD) navigateForward(soleNext.id);
      return;
    }

    if (session.edge === 'top' && event.deltaY < 0 && previousNode) {
      event.preventDefault();
      session.pull += -event.deltaY;
      const progress = clamp01(session.pull / EDGE_THRESHOLD);
      setEdgePull({ direction: 'top', progress });
      if (session.pull >= EDGE_THRESHOLD) navigatePrevious();
    }
  };

  const pinch = usePinch({ onZoomOut: () => setLevel('flow') });
  const signedPull = edgePull.direction === 'bottom'
    ? -edgePull.progress * 14
    : edgePull.direction === 'top'
      ? edgePull.progress * 14
      : 0;

  const edgeStyle = {
    '--note-pull-offset': `${signedPull}px`,
    '--note-pull-progress': String(edgePull.progress),
  } as CSSProperties;

  return (
    <section
      className={`scene note-scene note-travel-${travelDirection} edge-pull-${edgePull.direction ?? 'none'}`}
      style={edgeStyle}
      {...pinch}
    >
      <button className="note-back" onClick={() => { flush(); setLevel('flow'); }} aria-label="Back to focused graph"><span /></button>

      {previousNode && (
        <div className={`note-edge note-edge-top ${edgeState.top ? 'is-visible' : ''}`}>
          <button onClick={navigatePrevious}>
            <small>previous</small>
            <strong>{previousNode.title}</strong>
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className={`note-scroll note-phase-${phase}`}
        onScroll={syncEdges}
        onWheel={handleEdgeWheel}
        onTouchStartCapture={(event) => {
          if (event.touches.length !== 1) return;
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
            const progress = clamp01(gesture.pull / TOUCH_THRESHOLD);
            setEdgePull({ direction: 'bottom', progress });
            if (outgoing.length > 1 && progress > 0.55) setBranchOpen(true);
            return;
          }

          if (gesture.atTop && dy > 0 && previousNode) {
            event.preventDefault();
            gesture.direction = 'top';
            gesture.pull = dy;
            setEdgePull({ direction: 'top', progress: clamp01(gesture.pull / TOUCH_THRESHOLD) });
          }
        }}
        onTouchEndCapture={() => {
          const gesture = touchSession.current;
          touchSession.current = null;
          if (!gesture || phase !== 'idle') {
            resetEdgePull();
            return;
          }

          if (gesture.direction === 'bottom' && gesture.pull >= TOUCH_THRESHOLD) {
            if (soleNext) navigateForward(soleNext.id);
            else if (outgoing.length > 1) setBranchOpen(true);
            else resetEdgePull();
            return;
          }

          if (gesture.direction === 'top' && gesture.pull >= TOUCH_THRESHOLD && previousNode) {
            navigatePrevious();
            return;
          }

          resetEdgePull();
        }}
        onTouchCancelCapture={() => {
          touchSession.current = null;
          resetEdgePull();
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

      {outgoing.length > 0 && (
        <div className={`note-edge note-edge-bottom ${edgeState.bottom ? 'is-visible' : ''} ${outgoing.length > 1 ? 'has-branches' : ''} ${branchOpen ? 'is-open' : ''}`}>
          {soleNext ? (
            <button className="note-edge-single" onClick={() => navigateForward(soleNext.id)}>
              <small>next</small>
              <strong>{soleNext.title}</strong>
              <span className="note-edge-arrow" />
            </button>
          ) : (
            <div className="note-edge-branches">
              <div className="note-edge-branch-label">choose next</div>
              {outgoing.map(({ edge, node: nextNode }, index) => (
                <button key={edge.id} onClick={() => navigateForward(nextNode.id)}>
                  <small>path {index + 1}</small>
                  <strong>{nextNode.title}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
