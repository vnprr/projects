import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import { layoutProjectTopDown, type GraphPosition } from '../domain/layout';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

type StoryMapData = {
  title: string;
  text: string;
  current: boolean;
  branch: boolean;
};

type RoutedEdgeData = {
  sourceOrder: number;
  sourceCount: number;
  targetOrder: number;
  targetCount: number;
  branch: boolean;
};

type StoryMapNode = Node<StoryMapData, 'story'>;
type StoryGraphEdge = Edge<RoutedEdgeData, 'routed'>;

function SemanticStoryNode({ data }: NodeProps<StoryMapNode>) {
  const { zoom } = useViewport();
  const showTitle = data.current || zoom >= 0.43;
  const showText = zoom >= 0.94;

  return (
    <div
      className={[
        'semantic-map-node',
        showTitle ? 'shows-title' : '',
        showText ? 'shows-text' : '',
        data.current ? 'is-current' : '',
        data.branch ? 'is-branch' : '',
      ].filter(Boolean).join(' ')}
    >
      <Handle type="target" position={Position.Top} />
      <span className="semantic-map-node-mark" />
      {showTitle && <strong>{data.title || 'Untitled'}</strong>}
      {showText && data.text.trim() && <p>{data.text.trim().slice(0, 118)}</p>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function RoutedStoryEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<StoryGraphEdge>) {
  const vertical = Math.max(72, targetY - sourceY);
  const sourceSpread = ((data?.sourceOrder ?? 0) - ((data?.sourceCount ?? 1) - 1) / 2) * 32;
  const targetSpread = ((data?.targetOrder ?? 0) - ((data?.targetCount ?? 1) - 1) / 2) * 18;
  const horizontalDistance = targetX - sourceX;

  const corridorX =
    sourceX +
    horizontalDistance * 0.5 +
    sourceSpread -
    targetSpread;

  const leaveY = sourceY + Math.min(88, vertical * 0.34);
  const enterY = targetY - Math.min(88, vertical * 0.34);
  const middleY = sourceY + vertical * 0.52;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${leaveY}, ${corridorX} ${leaveY}, ${corridorX} ${middleY}`,
    `C ${corridorX} ${enterY}, ${targetX} ${enterY}, ${targetX} ${targetY}`,
  ].join(' ');

  return (
    <path
      className={`react-flow__edge-path story-routed-path ${data?.branch ? 'is-branch-path' : ''}`}
      d={path}
      fill="none"
    />
  );
}

const nodeTypes = { story: SemanticStoryNode };
const edgeTypes = { routed: RoutedStoryEdge };

function GraphCamera({ positions }: { positions: Record<string, GraphPosition> }) {
  const { state } = useNavigation();
  const { fitView, getViewport, setCenter } = useReactFlow<StoryMapNode, StoryGraphEdge>();
  const initialized = useRef(false);

  useEffect(() => {
    if (!Object.keys(positions).length) return;

    const frame = requestAnimationFrame(() => {
      if (!initialized.current) {
        void fitView({ padding: 0.22, maxZoom: 0.72, duration: 0 });
        initialized.current = true;
        return;
      }

      if (!window.matchMedia('(max-width: 720px)').matches) return;
      const position = positions[state.currentNodeId];
      if (!position) return;

      const viewport = getViewport();
      void setCenter(position.x + 88, position.y + 34, {
        zoom: Math.max(0.56, viewport.zoom),
        duration: 420,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [fitView, getViewport, positions, setCenter, state.currentNodeId]);

  return null;
}

function CanvasInner() {
  const { project, createNodeAfter } = useProject();
  const { state, focusCanvasNode, setLevel } = useNavigation();
  const [positions, setPositions] = useState<Record<string, GraphPosition>>({});
  const [layoutPending, setLayoutPending] = useState(true);
  const lastTap = useRef<{ id: string; at: number } | null>(null);

  const topologyKey = useMemo(
    () => [
      ...project.nodes.map((node) => node.id),
      '|',
      ...project.edges.map((edge) => `${edge.id}:${edge.from}>${edge.to}`),
    ].join(';'),
    [project.edges, project.nodes],
  );

  useEffect(() => {
    let cancelled = false;
    setLayoutPending(true);

    void layoutProjectTopDown(project).then((next) => {
      if (cancelled) return;
      setPositions(next);
      setLayoutPending(false);
    });

    return () => {
      cancelled = true;
    };
  }, [project, topologyKey]);

  const nodes = useMemo<StoryMapNode[]>(() => project.nodes.map((node) => ({
    id: node.id,
    type: 'story',
    position: positions[node.id] ?? { x: 0, y: 0 },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: node.id === state.currentNodeId ? 3 : 1,
    data: {
      title: node.title,
      text: node.text,
      current: node.id === state.currentNodeId,
      branch: project.edges.filter((edge) => edge.from === node.id).length > 1,
    },
    className: 'story-map-node',
  })), [positions, project.edges, project.nodes, state.currentNodeId]);

  const outgoing = useMemo(() => {
    const groups = new Map<string, typeof project.edges>();
    for (const edge of project.edges) {
      const list = groups.get(edge.from) ?? [];
      list.push(edge);
      groups.set(edge.from, list);
    }
    return groups;
  }, [project.edges]);

  const incoming = useMemo(() => {
    const groups = new Map<string, typeof project.edges>();
    for (const edge of project.edges) {
      const list = groups.get(edge.to) ?? [];
      list.push(edge);
      groups.set(edge.to, list);
    }
    return groups;
  }, [project.edges]);

  const edges = useMemo<StoryGraphEdge[]>(() => project.edges.map((edge) => {
    const sourceEdges = outgoing.get(edge.from) ?? [];
    const targetEdges = incoming.get(edge.to) ?? [];

    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'routed',
      focusable: false,
      selectable: false,
      className: `story-edge ${edge.type === 'branch' ? 'is-branch' : ''}`,
      data: {
        sourceOrder: Math.max(0, sourceEdges.findIndex((item) => item.id === edge.id)),
        sourceCount: Math.max(1, sourceEdges.length),
        targetOrder: Math.max(0, targetEdges.findIndex((item) => item.id === edge.id)),
        targetCount: Math.max(1, targetEdges.length),
        branch: edge.type === 'branch',
      },
    };
  }), [incoming, outgoing, project.edges]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        setLevel('note');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setLevel]);

  const addContinuation = () => {
    const created = createNodeAfter(state.currentNodeId);
    focusCanvasNode(created.id);
    setLevel('note');
  };

  return (
    <section className={`scene canvas-scene graph-mode-canvas ${layoutPending ? 'is-layout-pending' : ''}`}>
      <div className="canvas-label"><span>{project.title}</span><small>graph</small></div>

      <ReactFlow<StoryMapNode, StoryGraphEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        minZoom={0.18}
        maxZoom={1.42}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const now = performance.now();
          const previousTap = lastTap.current;
          const alreadyCurrent = node.id === state.currentNodeId;

          if (
            alreadyCurrent &&
            previousTap?.id === node.id &&
            now - previousTap.at < 430
          ) {
            setLevel('note');
          } else {
            focusCanvasNode(node.id);
          }

          lastTap.current = { id: node.id, at: now };
        }}
        onNodeDoubleClick={(_, node) => {
          focusCanvasNode(node.id);
          setLevel('note');
        }}
      >
        <GraphCamera positions={positions} />
      </ReactFlow>

      <button className="graph-add" onClick={addContinuation} aria-label="Add continuation">
        <span>+</span>
        <em>continuation</em>
      </button>

      <div className="canvas-hint">
        drag · scroll / pinch to zoom · tap node · tap again to write
      </div>
    </section>
  );
}

export function CanvasView() {
  return <ReactFlowProvider><CanvasInner /></ReactFlowProvider>;
}
