import { useCallback, useEffect, useRef, useState } from 'react';

type Note = { id: string; text: string; updatedAt: number };
type Workspace = { activeId: string; notes: Note[] };

const STORAGE_KEY = 'storyspace.mobile-notebook.v1';
const newId = () => globalThis.crypto?.randomUUID?.() ?? (Date.now() + '-' + Math.random().toString(36).slice(2));
const freshNote = (): Note => ({ id: newId(), text: '', updatedAt: Date.now() });

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === 'object' && 'notes' in value && Array.isArray(value.notes)) {
        const notes = value.notes.filter((n): n is Note =>
          !!n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.updatedAt === 'number',
        );
        if (notes.length) {
          const activeId = 'activeId' in value && typeof value.activeId === 'string'
            && notes.some((n) => n.id === value.activeId)
            ? value.activeId : notes[0]!.id;
          return { notes, activeId };
        }
      }
    }
  } catch { /* Invalid or unavailable storage: keep a working in-memory notebook. */ }
  const note = freshNote();
  return { notes: [note], activeId: note.id };
}

function noteLabel(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 70) || 'Pusta notatka';
}

export function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const workspaceRef = useRef(workspace);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const saveTimer = useRef<number | null>(null);

  const save = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaceRef.current)); }
    catch { /* Still editable when storage is blocked or full. */ }
  }, []);

  const commit = useCallback((next: Workspace) => {
    workspaceRef.current = next;
    setWorkspace(next);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, 200);
  }, [save]);

  useEffect(() => {
    const flushOnHide = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', flushOnHide);
      save();
    };
  }, [save]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
        menuRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  useEffect(() => { if (drawerOpen) addRef.current?.focus(); }, [drawerOpen]);

  const active = workspace.notes.find((note) => note.id === workspace.activeId) ?? workspace.notes[0]!;
  const changeText = (text: string) => {
    const old = workspaceRef.current;
    commit({ ...old, notes: old.notes.map((note) =>
      note.id === old.activeId ? { ...note, text, updatedAt: Date.now() } : note,
    ) });
  };
  const activate = (id: string) => {
    if (!workspaceRef.current.notes.some((note) => note.id === id)) return;
    commit({ ...workspaceRef.current, activeId: id });
    setDrawerOpen(false);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };
  const addNote = () => {
    const note = freshNote();
    const old = workspaceRef.current;
    commit({ activeId: note.id, notes: [note, ...old.notes] });
    setDrawerOpen(false);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };

  return (
    <main className="notebook">
      <button
        ref={menuRef}
        className={'menu-toggle' + (drawerOpen ? ' is-open' : '')}
        type="button"
        aria-label={drawerOpen ? 'Zamknij menu' : 'Otwórz menu'}
        aria-controls="notes-drawer"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((value) => !value)}
      >
        <span /><span />
      </button>
      <section className="page" aria-label="Edytor notatki">
        <textarea
          key={active.id}
          ref={editorRef}
          className="editor"
          value={active.text}
          onChange={(event) => changeText(event.target.value)}
          aria-label="Treść notatki"
          autoCapitalize="sentences"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
        />
      </section>
      {drawerOpen && <button className="scrim" type="button" aria-label="Zamknij menu" onClick={() => setDrawerOpen(false)} />}
      <nav id="notes-drawer" className={'drawer' + (drawerOpen ? ' is-open' : '')} aria-label="Notatki" aria-hidden={!drawerOpen} inert={!drawerOpen}>
        <div className="drawer-head">Notatki</div>
        <button ref={addRef} className="new-note" type="button" onClick={addNote}>
          <span aria-hidden="true">+</span> Nowa notatka
        </button>
        <div className="note-list">
          {workspace.notes.map((note) => (
            <button
              key={note.id}
              className={'note-item' + (note.id === active.id ? ' is-active' : '')}
              type="button"
              aria-current={note.id === active.id ? 'page' : undefined}
              onClick={() => activate(note.id)}
            >
              {noteLabel(note.text)}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
