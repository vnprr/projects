import ELK from 'elkjs/lib/elk.bundled.js';
import type { Project } from './types';

export type GraphPosition = { x: number; y: number };

const NODE_WIDTH = 176;
const NODE_HEIGHT = 68;
const elk = new ELK();

export async function layoutProjectTopDown(project: Project): Promise<Record<string, GraphPosition>> {
  if (!project.nodes.length) return {};

  const nodeIds = new Set(project.nodes.map((node) => node.id));
  const validEdges = project.edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to,
  );

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'SPLINES',
      'elk.spacing.nodeNode': '88',
      'elk.layered.spacing.nodeNodeBetweenLayers': '148',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.thoroughness': '8',
      'elk.padding': '[top=34,left=34,bottom=34,right=34]',
    },
    children: project.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: validEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };

  try {
    const result = await elk.layout(graph);
    const positions: Record<string, GraphPosition> = {};

    for (const child of result.children ?? []) {
      positions[child.id] = {
        x: child.x ?? 0,
        y: child.y ?? 0,
      };
    }

    return positions;
  } catch {
    const positions: Record<string, GraphPosition> = {};
    project.nodes.forEach((node, index) => {
      positions[node.id] = {
        x: (index % 3) * 260,
        y: Math.floor(index / 3) * 190,
      };
    });
    return positions;
  }
}
