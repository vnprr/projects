import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePinch } from '../hooks/useGestures';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';
import './noteFlow.css';

export function NoteView() {
  const { project, updateNodeContent } = useProject();
  const { state, setLevel, goToNode } = useNavigation();
  const node = project.nodes.find((item) => item.id === state.currentNodeId) ?? project.nodes[0]!;
  const [title, setTitle] = useState(node.title);
  const [text, setText] = useState(node.text);
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'entering'>('idle');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ nodeId: node.id, title: node.title, text: node.text });
  const edgeWheel = useRef(0);
  const edgeWheelTimer = useRef<number | null>(null);
  const touchEdge = useRef<{ startY: number; armed: boolean } | null>(null);
  const transitionTimers = useRef<number[]>([]);

  const outgoing = useMemo(() => project.edges
    .filter((edge) => edge.from === node.id)
    .map((edge) => ({ edge, node: project.nodes.find((item) => item.id === edge.to) }))
    .filter((item): item is { edge: (typeof project.edges)[number]; node: (typeof project.nodes)[number] } => Boolean(item.node)),
  [node.id, project.edges, project.nodes]);

  const flush = useCallback(() => {
    const value = latest.current;
    updateNodeContent(value.nodeId, value.title, value.text);
  }, [updateNodeContent]);

  useLayoutEffect(() => {
    setTitle(node.title);
    setText(node.text);
    latest.current = { nodeId: node.id, title: node.title, text: node.text };
    scrollRef.current?.scrollTo({ top: 0 });
  // node.id is the boundary between documents; project persistence must not reset scroll while typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useLayoutEffect(() => {
    const textarea = textRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(260, textarea.scrollHeight)}px`;
  }, [node.id, text]);

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
    if (edgeWheelTimer.current) window.clearTimeout(edgeWheelTimer.current);
  }, []);

  const navigateTo = useCallback((nodeId: string) => {
    if (phase !== 'idle') return;
    flush();
    setPhase('leaving');
    const leave = window.setTimeout(() => {
      goToNode(nodeId);
      scrollRef.current?.scrollTo({ top: 0 });
      setPhase('entering');
      const enter = window.setTimeout(() => setPhase('idle'), 280);
      transitionTimers.current.push(enter);
    }, 125);
    transitionTimers.current.push(leave);
  }, [flush, goToNode, phase]);

  const atBottom = () => {
    const element = scrollRef.current;
    if (!element) return false;
    return element.scrollTop + element.clientHeight >= element.scrollHeight - 4;
  };

  const maybeContinue = (amount: number) => {
    if (outgoing.length !== 1 || !atBottom() || phase !== 'idle') return;
    edgeWheel.current += amount;
    if (edgeWheel.current >= 118) {
      edgeWheel.current = 0;
      navigateTo(outgoing[0].node.id);
    }
  };

  const pinch = usePinch({ onZoomOut: () => setLevel('flow') });

  return (
    <section className="scene note-scene" {...pinch}>
      <button className="note-back" onClick={() => { flush(); setLevel('flow'); }} aria-label="Back to focused graph"><span /></button>
      <div
        ref={scrollRef}
        className={`note-scroll note-phase-${phase}`}
        onWheel={(event) => {
          if (event.deltaY <= 0 || outgoing.length !== 1 || !atBottom()) {
            edgeWheel.current = 0;
            return;
          }
          maybeContinue(event.deltaY);
          if (edgeWheelTimer.current) window.clearTimeout(edgeWheelTimer.current);
          edgeWheelTimer.current = window.setTimeout(() => { edgeWheel.current = 0; }, 180);
        }}
        onTouchStartCapture={(event) => {
          const touch = event.touches.item(0);
          if (!touch) return;
          touchEdge.current = { startY: touch.clientY, armed: outgoing.length === 1 && atBottom() };
        }}
        onTouchMoveCapture={(event) => {
          const touch = event.touches.item(0);
          const gesture = touchEdge.current;
          if (!touch || !gesture?.armed || phase !== 'idle') return;
          const pull = gesture.startY - touch.clientY;
          if (pull > 112) {
            event.preventDefault();
            gesture.armed = false;
            navigateTo(outgoing[0].node.id);
          }
        }}
        onTouchEndCapture={() => { touchEdge.current = null; }}
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

          {outgoing.length > 0 && (
            <div className="note-continuation" aria-label="Continue through story">
              <div className="note-continuation-line" />
              <span className="note-continuation-label">continue</span>
              <div className={`note-continuation-options ${outgoing.length > 1 ? 'has-branches' : ''}`}>
                {outgoing.map(({ edge, node: nextNode }, index) => (
                  <button key={edge.id} onClick={() => navigateTo(nextNode.id)}>
                    <small>{outgoing.length > 1 ? `path ${index + 1}` : 'next'}</small>
                    <strong>{nextNode.title}</strong>
                    <span>{nextNode.text.slice(0, 88)}</span>
                  </button>
                ))}
              </div>
              {outgoing.length === 1 && <em>scroll a little further to continue</em>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
