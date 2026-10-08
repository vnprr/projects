export type EdgeType = 'next' | 'branch';
export type NavigationLevel = 'canvas' | 'focus' | 'note';
export type Motion = 'idle' | 'forward' | 'backward' | 'zoom-in' | 'zoom-out';

export type StoryNode = {
  id: string;
  title: string;
  text: string;
  position: { x: number; y: number };
  createdAt: string;
  updatedAt: string;
  ambientHue: number;
};

export type StoryEdge = {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
};

export type Project = {
  id: string;
  title: string;
  entryNodeId: string;
  nodes: StoryNode[];
  edges: StoryEdge[];
};

export type NavigationState = {
  currentNodeId: string;
  currentLevel: NavigationLevel;
  history: string[];
  motion: Motion;
};
