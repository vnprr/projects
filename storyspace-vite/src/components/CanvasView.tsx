import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Handle, Position, ReactFlow, ReactFlowProvider,
  useReactFlow, useViewport, type Edge, type EdgeProps,
  type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import { layoutProjectTopDown, type GraphPosition } from '../domain/layout';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

type MapData = { title: string; current: boolean };
type MapNode = Node<MapData, 'story'>;
type MapEdge = Edge<{ branch: boolean }, 'curve'>;

function MapNodeVisual({ data }: NodeProps<MapNode>) {
  const { zoom } = useViewport();
  return (
    <div className={`map-node ${data.current ? 'is-current' : ''} ${zoom < .38 ? 'is-distant' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <span className="map-node-marker" aria-hidden="true" />
      <strong>{data.title || 'Untitled'}</strong>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function CurveEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<MapEdge>) {
  // Both the ELK model and DOM nodes use the same 176×68 geometry.
  // A single monotonic Bezier replaces the old two-cubic detour/spaghetti.
  const direction = targetY >= sourceY ? 1 : -1;
  const curvature = Math.max(28, Math.min(98, Math.abs(targetY - sourceY) * .43));
  const path = `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + direction * curvature}, ${targetX} ${targetY - direction * curvature}, ${targetX} ${targetY}`;
  return <path className={`react-flow__edge-path map-curve ${data?.branch ? 'is-branch' : ''}`} d={path} fill="none" />;
}

const nodeTypes = { story: MapNodeVisual };
const edgeTypes = { curve: CurveEdge };

function InitialMapCamera({ positions }: { positions: Record<string, GraphPosition> }) {
  const { fitView } = useReactFlow<MapNode, MapEdge>();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !Object.keys(positions).length) return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      if (!active) return;
      void fitView({ duration: 240, padding: .18, maxZoom: .9 });
      initialized.current = true;
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [fitView, positions]);

  return null;
}

function MapInner() {
  const { project, createNodeAfter } = useProject();
  const { state, focusCanvasNode, setLevel } = useNavigation();
  const [positions, setPositions] = useState<Record<string, GraphPosition>>({});
  const [layoutPending, setLayoutPending] = useState(true);
  const userGesture = useRef(false);

  const topologyKey = [
    project.id,
    ...project.nodes.map((node) => node.id),
    '|',
    ...project.edges.map((edge) => `${edge.id}:${edge.from}>${edge.to}`),
  ].join(';');

  useEffect(() => {
    let cancelled = false;
    setLayoutPending(true);
    void layoutProjectTopDown(project).then((next) => {
      if (cancelled) return;
      setPositions(next);
      setLayoutPending(false);
    });
    return () => { cancelled = true; };
    // Layout must not restart when a note is edited and saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey]);

  const nodes = useMemo<MapNode[]>(() => project.nodes.map((node) => ({
    id: node.id,
    type: 'story',
    position: positions[node.id] ?? { x: 0, y: 0 },
    draggable: false,
    selectable: false,
    focusable: false,
    data: { title: node.title, current: node.id === state.currentNodeId },
    className: 'story-map-node',
  })), [positions, project.nodes, state.currentNodeId]);

  const edges = useMemo<MapEdge[]>(() => project.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'curve',
    selectable: false,
    focusable: false,
    data: { branch: edge.type === 'branch' },
  })), [project.edges]);

  const enterFocus = (id = state.currentNodeId) => {
    focusCanvasNode(id);
    setLevel('focus');
  };
  const addNext = () => {
    const created = createNodeAfter(state.currentNodeId);
    focusCanvasNode(created.id);
    setLevel('note');
  };

  return (
    <section className={`scene canvas-scene map-scene ${layoutPending ? 'is-layout-pending' : ''}`}>
      <div className="canvas-label"><span>{project.title}</span><small>map</small></div>
      <button className="map-focus-action" onClick={() => enterFocus()} aria-label="Zoom to selected note">FOCUS <span>↗</span></button>
      <ReactFlow<MapNode, MapEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        minZoom={.14}
        maxZoom={1.42}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
        onMoveStart={(event) => { if (event) userGesture.current = true; }}
        onMoveEnd={(_, viewport) => {
          if (userGesture.current && viewport.zoom > 1.24) enterFocus();
          userGesture.current = false;
        }}
        onNodeClick={(_, node) => enterFocus(node.id)}
      >
        <InitialMapCamera positions={positions} />
      </ReactFlow>
      <button className="graph-add" onClick={addNext} aria-label="Add continuation from selected note">
        <span>+</span><em>continuation</em>
      </button>
    </section>
  );
}

export function CanvasView() {
  return <ReactFlowProvider><MapInner /></ReactFlowProvider>;
}
