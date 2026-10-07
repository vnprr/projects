import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { sampleProject } from '../domain/sampleProject';
import type { Project, StoryEdge, StoryNode } from '../domain/types';

const STORAGE_KEY = 'storyspace.alpha.workspace.v3';
const LEGACY_STORAGE_KEY = 'storyspace.alpha.project.v2';

type Workspace = {
  currentProjectId: string;
  projects: Project[];
};

type ProjectContextValue = {
  project: Project;
  projects: Project[];
  switchProject: (projectId: string) => void;
  createProject: () => Project;
  createNodeAfter: (fromNodeId: string) => StoryNode;
  linkExistingNode: (fromNodeId: string, toNodeId: string) => StoryEdge | null;
  updateNodeContent: (nodeId: string, title: string, text: string) => void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

function freshId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyProject(): Project {
  const now = new Date().toISOString();
  const projectId = freshId('project');
  const nodeId = freshId('node');

  return {
    id: projectId,
    title: 'Untitled project',
    entryNodeId: nodeId,
    nodes: [{
      id: nodeId,
      title: 'Untitled',
      text: '',
      position: { x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
      ambientHue: 218,
    }],
    edges: [],
  };
}

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace;
      if (parsed?.projects?.length) {
        const currentExists = parsed.projects.some((project) => project.id === parsed.currentProjectId);
        return {
          projects: parsed.projects,
          currentProjectId: currentExists ? parsed.currentProjectId : parsed.projects[0]!.id,
        };
      }
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const project = JSON.parse(legacy) as Project;
      if (project?.nodes?.length) return { currentProjectId: project.id, projects: [project] };
    }
  } catch {
    // Corrupted local data falls back to the bundled demo project.
  }

  return { currentProjectId: sampleProject.id, projects: [sampleProject] };
}

export function ProjectProvider({ children }: PropsWithChildren) {
  const initialWorkspace = useMemo(loadWorkspace, []);
  const workspaceRef = useRef<Workspace>(initialWorkspace);
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);

  const commitWorkspace = useCallback((next: Workspace) => {
    workspaceRef.current = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setWorkspace(next);
  }, []);

  const switchProject = useCallback((projectId: string) => {
    const current = workspaceRef.current;
    if (!current.projects.some((project) => project.id === projectId)) return;
    commitWorkspace({ ...current, currentProjectId: projectId });
  }, [commitWorkspace]);

  const createProject = useCallback(() => {
    const created = createEmptyProject();
    const current = workspaceRef.current;
    commitWorkspace({
      currentProjectId: created.id,
      projects: [...current.projects, created],
    });
    return created;
  }, [commitWorkspace]);

  const updateCurrentProject = useCallback((updater: (project: Project) => Project) => {
    const current = workspaceRef.current;
    const projects = current.projects.map((project) => (
      project.id === current.currentProjectId ? updater(project) : project
    ));
    commitWorkspace({ ...current, projects });
  }, [commitWorkspace]);

  const createNodeAfter = useCallback((fromNodeId: string) => {
    const now = new Date().toISOString();
    const created: StoryNode = {
      id: freshId('node'),
      title: 'Untitled',
      text: '',
      position: { x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
      ambientHue: 214 + Math.floor(Math.random() * 22),
    };

    updateCurrentProject((project) => {
      const outgoingCount = project.edges.filter((edge) => edge.from === fromNodeId).length;
      const edge: StoryEdge = {
        id: freshId('edge'),
        from: fromNodeId,
        to: created.id,
        type: outgoingCount > 0 ? 'branch' : 'next',
      };

      return {
        ...project,
        nodes: [...project.nodes, created],
        edges: [...project.edges, edge],
      };
    });

    return created;
  }, [updateCurrentProject]);

  const linkExistingNode = useCallback((fromNodeId: string, toNodeId: string) => {
    if (fromNodeId === toNodeId) return null;

    const current = workspaceRef.current;
    const project = current.projects.find((item) => item.id === current.currentProjectId);
    if (!project) return null;
    if (!project.nodes.some((node) => node.id === fromNodeId)) return null;
    if (!project.nodes.some((node) => node.id === toNodeId)) return null;
    if (project.edges.some((edge) => edge.from === fromNodeId && edge.to === toNodeId)) return null;

    const outgoingCount = project.edges.filter((edge) => edge.from === fromNodeId).length;
    const edge: StoryEdge = {
      id: freshId('edge'),
      from: fromNodeId,
      to: toNodeId,
      type: outgoingCount > 0 ? 'branch' : 'next',
    };

    updateCurrentProject((value) => ({
      ...value,
      edges: [...value.edges, edge],
    }));

    return edge;
  }, [updateCurrentProject]);

  const updateNodeContent = useCallback((nodeId: string, title: string, text: string) => {
    updateCurrentProject((project) => ({
      ...project,
      nodes: project.nodes.map((node) => node.id === nodeId
        ? { ...node, title, text, updatedAt: new Date().toISOString() }
        : node),
    }));
  }, [updateCurrentProject]);

  const project = workspace.projects.find((item) => item.id === workspace.currentProjectId) ?? workspace.projects[0]!;

  const value = useMemo(() => ({
    project,
    projects: workspace.projects,
    switchProject,
    createProject,
    createNodeAfter,
    linkExistingNode,
    updateNodeContent,
  }), [
    createNodeAfter,
    createProject,
    linkExistingNode,
    project,
    switchProject,
    updateNodeContent,
    workspace.projects,
  ]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
}
