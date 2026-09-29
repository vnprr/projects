import type { Project } from './types';

export type GraphPosition = { x: number; y: number };

const X_GAP = 310;
const Y_GAP = 235;

export function layoutProjectTopDown(project: Project): Record<string, GraphPosition> {
  const nodeIndex = new Map(project.nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map<string, { to: string; edgeIndex: number }[]>();

  project.edges.forEach((edge, edgeIndex) => {
    const list = outgoing.get(edge.from) ?? [];
    list.push({ to: edge.to, edgeIndex });
    outgoing.set(edge.from, list);
  });

  const depth = new Map<string, number>([[project.entryNodeId, 0]]);
  const queue = [project.entryNodeId];

  while (queue.length) {
    const from = queue.shift()!;
    const nextDepth = (depth.get(from) ?? 0) + 1;
    for (const edge of outgoing.get(from) ?? []) {
      if (!depth.has(edge.to)) {
        depth.set(edge.to, nextDepth);
        queue.push(edge.to);
      }
    }
  }

  const maxConnectedDepth = Math.max(0, ...depth.values());
  let disconnectedDepth = maxConnectedDepth + 1;
  for (const node of project.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, disconnectedDepth++);
  }

  const ranks = new Map<number, string[]>();
  for (const node of project.nodes) {
    const rank = depth.get(node.id) ?? 0;
    const list = ranks.get(rank) ?? [];
    list.push(node.id);
    ranks.set(rank, list);
  }

  const incomingOrder = new Map<string, number>();
  project.edges.forEach((edge, edgeIndex) => {
    if (!incomingOrder.has(edge.to)) incomingOrder.set(edge.to, edgeIndex);
  });

  const positions: Record<string, GraphPosition> = {};
  [...ranks.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([rank, ids]) => {
      ids.sort((a, b) => {
        const edgeA = incomingOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
        const edgeB = incomingOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
        if (edgeA !== edgeB) return edgeA - edgeB;
        return (nodeIndex.get(a) ?? 0) - (nodeIndex.get(b) ?? 0);
      });

      const center = (ids.length - 1) / 2;
      ids.forEach((id, index) => {
        positions[id] = {
          x: (index - center) * X_GAP,
          y: rank * Y_GAP,
        };
      });
    });

  return positions;
}
