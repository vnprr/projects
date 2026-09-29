import { useEffect, useMemo } from 'react';
import { Background, ReactFlow, ReactFlowProvider, useNodesState, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

function CanvasInner() {
  const { project, updateNodePosition } = useProject();
  const { state, focusCanvasNode, setLevel } = useNavigation();

  const makeNodes = (): Node[] => project.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: {
      label: (
        <div className={`canvas-node-content ${node.id === state.currentNodeId ? 'is-current' : ''}`}>
          <span />
          <strong>{node.title}</strong>
          <p>{node.text.slice(0, 86)}</p>
        </div>
      ),
    },
    className: project.edges.filter((edge) => edge.from === node.id).length > 1 ? 'story-map-node is-branch' : 'story-map-node',
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(makeNodes());
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
        onNodeClick={(_, node) => focusCanvasNode(node.id)}
        onNodeDoubleClick={(_, node) => {
          focusCanvasNode(node.id);
          setLevel('flow');
        }}
        onNodeDragStop={(_, node) => updateNodePosition(node.id, node.position)}
      >
        <Background gap={34} size={1} />
      </ReactFlow>
      <div className="canvas-hint">double tap a node to enter flow</div>
    </section>
  );
}

export function CanvasView() {
  return <ReactFlowProvider><CanvasInner /></ReactFlowProvider>;
}
