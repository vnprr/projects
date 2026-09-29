import { useEffect, useRef, useState } from 'react';
import { usePinch } from '../hooks/useGestures';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

export function NoteView() {
  const { project, updateNodeContent } = useProject();
  const { state, setLevel } = useNavigation();
  const node = project.nodes.find((item) => item.id === state.currentNodeId) ?? project.nodes[0]!;
  const [title, setTitle] = useState(node.title);
  const [text, setText] = useState(node.text);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const latest = useRef({ nodeId: node.id, title: node.title, text: node.text });

  useEffect(() => {
    setTitle(node.title);
    setText(node.text);
    latest.current = { nodeId: node.id, title: node.title, text: node.text };
  }, [node.id]);

  useEffect(() => {
    latest.current = { nodeId: node.id, title, text };
    const timer = window.setTimeout(() => updateNodeContent(node.id, title, text), 450);
    return () => window.clearTimeout(timer);
  }, [node.id, title, text, updateNodeContent]);

  useEffect(() => {
    const flush = () => {
      const value = latest.current;
      updateNodeContent(value.nodeId, value.title, value.text);
    };
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
  }, [updateNodeContent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLevel('flow');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setLevel]);

  const pinch = usePinch({ onZoomOut: () => setLevel('flow') });

  return (
    <section className="scene note-scene" {...pinch}>
      <button className="note-back" onClick={() => setLevel('flow')} aria-label="Back to flow"><span /></button>
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
    </section>
  );
}
