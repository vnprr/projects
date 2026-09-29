import { useEffect, useMemo, useRef } from 'react';
import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import { layoutProjectTopDown } from '../domain/layout';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

type GraphMode = 'canvas' | 'flow';

type StoryMapData = {
  title: string;
  text: string;
  current: boolean;
  context: boolean;
  branch: boolean;
  mode: GraphMode;
};

type StoryMapNode = Node<StoryMapData, 'story'>;

function SemanticStoryNode({ data }: NodeProps<StoryMapNode>) {
  const { zoom } = useViewport();
  const canvasTitle = zoom >= 0.46;
  const canvasDetail = zoom >= 0.96;
  const showTitle = data.mode === 'flow' ? data.current || data.context : canvasTitle;
  const showText = data.mode === 'flow' ? data.current : canvasDetail;

  return (
    <div
      className={[
        'semantic-map-node',
        `mode-${data.mode}`,
        showTitle ? 'shows-title' : '',
        showText ? 'shows-text' : '',
        data.current ? 'is-current' : '',
        data.context ? 'is-context' : '',
        data.branch ? 'is-branch' : '',
      ].filter(Boolean).join(' ')}
    >
      <Handle type="target" position={Position.Top} />
      <span className="semantic-map-node-mark" />
      {showTitle && <strong>{data.title}</strong>}
      {showText && <p>{data.text.slice(0, 128)}</p>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { story: SemanticStoryNode };

function GraphCamera({ mode, positions }: { mode: GraphMode; positions: Record<string, { x: number; y: number }> }) {
  const { state } = useNavigation();
  const { setCenter, fitView } = useReactFlow<StoryMapNode>();
  const initialized = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (mode === 'canvas') {
        void fitView({
          padding: 0.24,
          maxZoom: 0.66,
          duration: initialized.current ? 520 : 0,
        });
        initialized.current = true;
        return;
      }

      const position = positions[state.currentNodeId];
      if (!position) return;
      const compact = window.matchMedia('(max-width: 640px)').matches;
      const width = compact ? 222 : 238;
      const height = compact ? 108 : 116;
      void setCenter(position.x + width / 2, position.y + height / 2, {
        zoom: compact ? 0.78 : 0.9,
        duration: initialized.current ? 520 : 0,
      });
      initialized.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [fitView, mode, positions, setCenter, state.currentNodeId]);

  return null;
}

function CanvasInner({ mode }: { mode: GraphMode }) {
  const { project } = useProject();
  const { state, focusCanvasNode, setLevel } = useNavigation();
  const positions = useMemo(() => layoutProjectTopDown(project), [project]);

  const contextIds = useMemo(() => {
    const ids = new Set<string>();
    project.edges.forEach((edge) => {
      if (edge.from === state.currentNodeId) ids.add(edge.to);
      if (edge.to === state.currentNodeId) ids.add(edge.from);
    });
    return ids;
  }, [project.edges, state.currentNodeId]);

  const nodes = useMemo<StoryMapNode[]>(() => project.nodes.map((node) => {
    const current = node.id === state.currentNodeId;
    const context = contextIds.has(node.id);
    return {
      id: node.id,
      type: 'story',
      position: positions[node.id] ?? { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: current ? 4 : context ? 2 : 0,
      data: {
        title: node.title,
        text: node.text,
        current,
        context,
        branch: project.edges.filter((edge) => edge.from === node.id).length > 1,
        mode,
      },
      className: `story-map-node ${mode === 'flow' && !current && !context ? 'is-distant' : ''}`,
    };
  }), [contextIds, mode, positions, project.edges, project.nodes, state.currentNodeId]);

  const edges = useMemo<Edge[]>(() => project.edges.map((edge) => {
    const contextual = edge.from === state.currentNodeId || edge.to === state.currentNodeId;
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'bezier',
      focusable: false,
      className: [
        'story-edge',
        edge.type === 'branch' ? 'is-branch' : '',
        mode === 'flow' ? (contextual ? 'is-context' : 'is-distant') : '',
      ].filter(Boolean).join(' '),
    };
  }), [mode, project.edges, state.currentNodeId]);

  return (
    <section className={`scene canvas-scene graph-mode-${mode}`}>
      <div className="canvas-label"><span>{project.title}</span><small>{mode === 'canvas' ? 'map' : 'focus'}</small></div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        minZoom={0.2}
        maxZoom={1.64}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (mode === 'canvas') {
            focusCanvasNode(node.id);
            setLevel('flow');
            return;
          }

          if (node.id === state.currentNodeId) setLevel('note');
          else focusCanvasNode(node.id);
        }}
        onNodeDoubleClick={(_, node) => {
          focusCanvasNode(node.id);
          setLevel('note');
        }}
        onMoveEnd={(_, viewport) => {
          if (mode === 'canvas' && viewport.zoom > 0.9) setLevel('flow');
          if (mode === 'flow' && viewport.zoom < 0.58) setLevel('canvas');
          if (mode === 'flow' && viewport.zoom > 1.48) setLevel('note');
        }}
      >
        <GraphCamera mode={mode} positions={positions} />
      </ReactFlow>
      <div className="canvas-hint">
        {mode === 'canvas'
          ? 'drag to explore · scroll / pinch to zoom · tap a node to focus'
          : 'scroll to change depth · tap a neighbour to follow · tap the focus to write'}
      </div>
    </section>
  );
}

export function CanvasView({ mode }: { mode: GraphMode }) {
  return <ReactFlowProvider><CanvasInner mode={mode} /></ReactFlowProvider>;
}
