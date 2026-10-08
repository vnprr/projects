import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { loadWorkspace, makeId, STORAGE_KEY, type Workspace } from './story';

const OUT = 0.72;
const IN = 1;
const SNAP = 0.87;
const clamp = (x: number) => Math.max(OUT, Math.min(IN, x));

type Pinch = { distance: number; startScale: number };
function distance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(loadWorkspace);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  const workspaceRef = useRef(workspace);
  const viewportRef = useRef<HTMLMainElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const wheelTimer = useRef<number | undefined>(undefined);
  const pinchRef = useRef<Pinch | null>(null);
  const scale = useMotionValue(IN);
  const frameOpacity = useTransform(scale, [OUT, .95, IN], [1, .28, 0]);
  const connectionsOpacity = useTransform(scale, [OUT, .92, 1], [1, .45, 0]);
  const corners = useTransform(scale, [OUT, IN], [26, 0]);
  const zoomRef = useRef<{ stop: () => void } | null>(null);

  const save = useCallback(() => {
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaceRef.current)); }
    catch { /* Allow editing even when storage is unavailable. */ }
  }, []);

  const commit = useCallback((next: Workspace) => {
    workspaceRef.current = next;
    setWorkspace(next);
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, 180);
  }, [save]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
      save();
    };
  }, [save]);

  const settle = useCallback((destination: number) => {
    zoomRef.current?.stop();
    const target = destination < SNAP ? OUT : IN;
    if (target === OUT) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    setOverview(target === OUT);
    zoomRef.current = animate(scale, target, {
      type: 'spring', stiffness: 390, damping: 37, mass: 1,
    });
  }, [scale]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      zoomRef.current?.stop();
      pinchRef.current = {
        distance: Math.max(1, distance(event.touches[0]!, event.touches[1]!)),
        startScale: scale.get(),
      };
    };
    const onMove = (event: TouchEvent) => {
      const gesture = pinchRef.current;
      if (!gesture || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      scale.set(clamp(gesture.startScale * distance(event.touches[0]!, event.touches[1]!) / gesture.distance));
    };
    const finish = (event: TouchEvent) => {
      if (!pinchRef.current || event.touches.length >= 2) return;
      pinchRef.current = null;
      settle(scale.get());
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.cancelable) event.preventDefault();
      zoomRef.current?.stop();
      scale.set(clamp(scale.get() - event.deltaY * .004));
      if (wheelTimer.current !== undefined) clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => settle(scale.get()), 170);
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', finish);
    element.addEventListener('touchcancel', finish);
    element.addEventListener('wheel', onWheel, { passive: false });
    // Safari's native gesture must not zoom the browser while we're scaling the scene.
    const blockSafariPageZoom = (event: Event) => { if (event.cancelable) event.preventDefault(); };
    element.addEventListener('gesturestart', blockSafariPageZoom, { passive: false });
    element.addEventListener('gesturechange', blockSafariPageZoom, { passive: false });
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', finish);
      element.removeEventListener('touchcancel', finish);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', blockSafariPageZoom);
      element.removeEventListener('gesturechange', blockSafariPageZoom);
      if (wheelTimer.current !== undefined) clearTimeout(wheelTimer.current);
      zoomRef.current?.stop();
    };
  }, [scale, settle]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (drawerOpen) {
        setDrawerOpen(false);
        menuRef.current?.focus();
      } else if (overview) settle(IN);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drawerOpen, overview, settle]);

  useEffect(() => { if (drawerOpen) addRef.current?.focus(); }, [drawerOpen]);

  const active = workspace.nodes.find((node) => node.id === workspace.activeId) ?? workspace.nodes[0]!;
  const incoming = workspace.nodes.filter((node) => node.links.includes(active.id));
  const outgoing = active.links.map((id) => workspace.nodes.find((node) => node.id === id))
    .filter((node): node is (typeof workspace.nodes)[number] => Boolean(node));
  const update = (key: 'title' | 'text', value: string) => {
    const old = workspaceRef.current;
    commit({ ...old, nodes: old.nodes.map((node) => node.id === old.activeId
      ? { ...node, [key]: value, updatedAt: Date.now() } : node) });
  };
  const navigate = (id: string) => {
    const old = workspaceRef.current;
    if (!old.nodes.some((node) => node.id === id)) return;
    commit({ ...old, activeId: id });
    setDrawerOpen(false);
    if (!overview) window.requestAnimationFrame(() => editorRef.current?.focus());
  };
  const addNote = () => {
    const old = workspaceRef.current;
    const id = makeId();
    const node = { id, title: '', text: '', links: [], updatedAt: Date.now() };
    commit({
      activeId: id,
      nodes: [...old.nodes.map((n) => n.id === old.activeId ? { ...n, links: [...n.links, id] } : n), node],
    });
    setDrawerOpen(false);
    settle(IN);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };

  return (
    <main className={`notebook${overview ? ' is-overview' : ''}`} ref={viewportRef}>
      <motion.div className="world" style={{ scale }}>
        <motion.div className="connections" style={{ opacity: connectionsOpacity }} aria-hidden={!overview}>
          <div className="previous-nodes">
            {incoming.length ? incoming.map((node) => (
              <button type="button" className="neighbor neighbor-previous" key={node.id}
                tabIndex={overview ? 0 : -1} onClick={() => navigate(node.id)}>
                <small>POPRZEDNIA SCENA</small><strong>{node.title || 'Bez tytułu'}</strong>
              </button>
            )) : <div className="empty-neighbor">POCZĄTEK HISTORII</div>}
          </div>
          <svg className="line line-top" viewBox="0 0 40 60" preserveAspectRatio="none" focusable="false" aria-hidden="true">
            <path d="M20 0 V60" /> <circle cx="20" cy="55" r="2.5" />
          </svg>
          <svg className="line line-bottom" viewBox="0 0 400 60" preserveAspectRatio="none" focusable="false" aria-hidden="true">
            <circle cx="200" cy="5" r="2.5" />
            {outgoing.length > 1 ? (
              <path d="M200 0 V24 Q200 32 190 32 H106 Q100 32 100 39 V58 M200 24 Q200 32 210 32 H294 Q300 32 300 39 V58" />
            ) : <path d="M200 0 V60" />}
          </svg>
          <div className="next-nodes">
            {outgoing.length ? outgoing.map((node) => (
              <button type="button" className="neighbor neighbor-next" key={node.id}
                tabIndex={overview ? 0 : -1} onClick={() => navigate(node.id)}>
                <small>NASTĘPNA SCENA <span aria-hidden="true">↗</span></small><strong>{node.title || 'Bez tytułu'}</strong>
              </button>
            )) : <div className="empty-neighbor">KONIEC ŚCIEŻKI</div>}
          </div>
        </motion.div>
        <section className="sheet" aria-label="Edytor sceny">
          <motion.div className="sheet-frame" style={{ opacity: frameOpacity, borderRadius: corners }} aria-hidden="true" />
          <div className="sheet-content">
            <div className="eyebrow" aria-hidden="true"><span className="status-dot" /> SCENA {String(workspace.nodes.indexOf(active) + 1).padStart(2, '0')}</div>
            <input
              key={`title-${active.id}`}
              className="title-input"
              type="text"
              value={active.title}
              onChange={(event) => update('title', event.target.value)}
              aria-label="Tytuł sceny"
              placeholder="Bez tytułu"
              readOnly={overview}
              spellCheck
            />
            <div className="title-rule" />
            <textarea
              key={`text-${active.id}`}
              className="body-input"
              ref={editorRef}
              value={active.text}
              onChange={(event) => update('text', event.target.value)}
              aria-label="Treść sceny"
              placeholder="Zacznij pisać…"
              readOnly={overview}
              spellCheck
            />
          </div>
        </section>
      </motion.div>
      <button ref={menuRef} className={`menu-toggle${drawerOpen ? ' is-open' : ''}`} type="button"
        aria-label={drawerOpen ? 'Zamknij menu' : 'Otwórz menu'}
        aria-controls="notes-drawer" aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((current) => !current)}><span /><span /></button>
      <button className="zoom-toggle" type="button" onClick={() => settle(overview ? IN : OUT)}
        aria-label={overview ? 'Powiększ notatkę' : 'Oddal i pokaż powiązania'}>
        {overview ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" /></svg>}
      </button>
      <div className="hint" aria-hidden="true">{overview ? 'ROZSUŃ PALCE, BY WRÓCIĆ' : 'ZSUŃ PALCE, BY ZOBACZYĆ POWIĄZANIA'}</div>
      {drawerOpen && <button className="scrim" type="button" aria-label="Zamknij menu" onClick={() => setDrawerOpen(false)} />}
      <nav id="notes-drawer" className={`drawer${drawerOpen ? ' is-open' : ''}`} aria-label="Sceny"
        aria-hidden={!drawerOpen} inert={!drawerOpen}>
        <header className="drawer-head"><small>STORYSPACE / PROTOTYP</small><h2>Sceny</h2></header>
        <button ref={addRef} className="new-note" type="button" onClick={addNote}><span aria-hidden="true">＋</span> Nowa scena</button>
        <div className="note-list">
          {workspace.nodes.map((node, i) => (
            <button type="button" key={node.id} className={`note-item${node.id === active.id ? ' is-active' : ''}`}
              aria-current={node.id === active.id ? 'page' : undefined} onClick={() => navigate(node.id)}>
              <span className="note-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="note-item-copy"><strong>{node.title || 'Bez tytułu'}</strong>
                <small>{node.text.replace(/\s+/g, ' ').slice(0, 80) || 'Pusta scena'}</small></span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
