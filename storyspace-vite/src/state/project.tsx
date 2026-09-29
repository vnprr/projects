import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { sampleProject } from '../domain/sampleProject';
import type { Project } from '../domain/types';

const STORAGE_KEY = 'storyspace.alpha.project.v2';

type ProjectContextValue = {
  project: Project;
  updateNodeContent: (nodeId: string, title: string, text: string) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sampleProject;
    const parsed = JSON.parse(raw) as Project;
    return parsed?.nodes?.length ? parsed : sampleProject;
  } catch {
    return sampleProject;
  }
}

export function ProjectProvider({ children }: PropsWithChildren) {
  const initialProject = useMemo(loadProject, []);
  const projectRef = useRef<Project>(initialProject);
  const [project, setProject] = useState<Project>(initialProject);

  const commitProject = useCallback((next: Project) => {
    projectRef.current = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProject(next);
  }, []);

  const updateNodeContent = useCallback((nodeId: string, title: string, text: string) => {
    const current = projectRef.current;
    commitProject({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, title, text, updatedAt: new Date().toISOString() } : node),
    });
  }, [commitProject]);

  const updateNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    const current = projectRef.current;
    commitProject({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, position } : node),
    });
  }, [commitProject]);

  const value = useMemo(() => ({ project, updateNodeContent, updateNodePosition }), [project, updateNodeContent, updateNodePosition]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
}
