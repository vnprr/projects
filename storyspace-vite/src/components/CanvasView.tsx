import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

type StoryMapData = {
  title: string;
  text: string;
  current: boolean;
  branch: boolean;
};

type StoryMapNode = Node<StoryMapData, 'story'>;

function SemanticStoryNode({ data }: NodeProps<StoryMapNode>) {
  const { zoom } = useViewport();
  const mid = zoom >= 0.52;
  const detail = zoom >= 0.95;

  return (
    <div className={`semantic-map-node ${mid ? 'is-mid' : ''} ${detail ? 'is-detail' : ''} ${data.current ? 'is-current' : ''} ${data.branch ? 'is-branch' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="semantic-map-node-mark" />
      {mid && <strong>{data.title}</strong>}
      {detail && <p>{data.text.slice(0, 96)}</p>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { story: SemanticStoryNode };

function CanvasInner() {
  const { project, updateNodePosition } = useProject();
  const { state, focusCanvasNode, setLevel } = useNavigation();
  const lastTap = useRef<{ id: string; at: number } | null>(null);

  const makeNodes = (): StoryMapNode[] => project.nodes.map((node) => ({
    id: node.id,
    type: 'story',
    position: node.position,
    data: {
      title: node.title,
      text: node.text,
      current: node.id === state.currentNodeId,
      branch: project.edges.filter((edge) => edge.from === node.id).length > 1,
    },
    className: 'story-map-node',
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState<StoryMapNode>(makeNodes());
  useEffect(() => setNodes(makeNodes()), [project.nodes, project.edges, state.currentNodeId]);

  const edges = useMemo<Edge[]>(() => project.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    className: edge.type === 'branch' ? 'story-edge is-branch' : 'story-edge',
  })), [project.edges]);

  return (
    <section className="scene canvas-scene">
      <div className="canvas-label"><span>{project.title}</span><small>map</small></div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        minZoom={0.18}
        maxZoom={1.9}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 0.78 }}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const now = performance.now();
          const previous = lastTap.current;
          focusCanvasNode(node.id);
          if (previous?.id === node.id && now - previous.at < 360) setLevel('flow');
          lastTap.current = { id: node.id, at: now };
        }}
        onNodeDoubleClick={(_, node) => {
          focusCanvasNode(node.id);
          setLevel('flow');
        }}
        onNodeDragStop={(_, node) => updateNodePosition(node.id, node.position)}
        onMoveEnd={(_, viewport) => {
          if (viewport.zoom > 1.52) setLevel('flow');
        }}
      >
        <Background gap={34} size={1} />
      </ReactFlow>
      <div className="canvas-hint">tap twice · or pinch closer · to enter flow</div>
    </section>
  );
}

export function CanvasView() {
  return <ReactFlowProvider><CanvasInner /></ReactFlowProvider>;
}
