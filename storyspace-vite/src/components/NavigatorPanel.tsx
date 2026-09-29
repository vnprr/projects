import { useMemo, useState } from 'react';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';
import './navigator.css';

export function NavigatorPanel() {
  const { project, projects, switchProject, createProject } = useProject();
  const { state, focusCanvasNode, setLevel } = useNavigation();
  const [open, setOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const currentIndex = useMemo(
    () => Math.max(0, project.nodes.findIndex((node) => node.id === state.currentNodeId)),
    [project.nodes, state.currentNodeId],
  );

  const closeOnCompact = () => {
    if (window.matchMedia('(max-width: 760px)').matches) setOpen(false);
  };

  const openNode = (nodeId: string) => {
    focusCanvasNode(nodeId);
    setLevel('note');
    closeOnCompact();
  };

  const chooseProject = (projectId: string) => {
    const target = projects.find((item) => item.id === projectId);
    if (!target) return;
    switchProject(projectId);
    focusCanvasNode(target.entryNodeId);
    setLevel('canvas');
    setProjectMenuOpen(false);
    closeOnCompact();
  };

  const addProject = () => {
    const created = createProject();
    focusCanvasNode(created.entryNodeId);
    setLevel('note');
    setProjectMenuOpen(false);
    closeOnCompact();
  };

  return (
    <>
      <button
        className={`navigator-toggle ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close navigator' : 'Open navigator'}
        aria-expanded={open}
      >
        <span /><span /><span />
      </button>

      <button
        className={`navigator-scrim ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(false)}
        aria-label="Close navigator"
        tabIndex={open ? 0 : -1}
      />

      <aside className={`navigator-panel ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="navigator-project-wrap">
          <button
            className="navigator-project"
            onClick={() => setProjectMenuOpen((value) => !value)}
            aria-expanded={projectMenuOpen}
          >
            <span className="navigator-project-mark" />
            <span className="navigator-project-copy">
              <small>project</small>
              <strong>{project.title}</strong>
            </span>
            <span className={`navigator-chevron ${projectMenuOpen ? 'is-open' : ''}`} />
          </button>

          {projectMenuOpen && (
            <div className="navigator-project-menu">
              {projects.map((item) => (
                <button
                  key={item.id}
                  className={item.id === project.id ? 'is-current' : ''}
                  onClick={() => chooseProject(item.id)}
                >
                  <span>{item.title}</span>
                  <small>{item.nodes.length} {item.nodes.length === 1 ? 'node' : 'nodes'}</small>
                </button>
              ))}
              <button className="navigator-new-project" onClick={addProject}>
                <span>New project</span>
                <small>create an empty story space</small>
              </button>
            </div>
          )}
        </div>

        <div className="navigator-section-head">
          <span>notes</span>
          <small>{currentIndex + 1} / {project.nodes.length}</small>
        </div>

        <nav className="navigator-notes" aria-label="Project notes">
          {project.nodes.map((node, index) => (
            <button
              key={node.id}
              className={node.id === state.currentNodeId ? 'is-current' : ''}
              onClick={() => openNode(node.id)}
            >
              <span className="navigator-note-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="navigator-note-copy">
                <strong>{node.title || 'Untitled'}</strong>
                <small>{node.text.trim() ? node.text.trim().slice(0, 54) : 'Empty note'}</small>
              </span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
