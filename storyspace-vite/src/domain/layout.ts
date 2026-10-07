import type { Project } from './types';

export type GraphPosition = { x: number; y: number };

const X_GAP = 286;
const Y_GAP = 218;

function branchLaneOffset(index: number) {
  if (index === 0) return 0;
  const step = Math.ceil(index / 2);
  return index % 2 === 1 ? step : -step;
}

export function layoutProjectTopDown(project: Project): Record<string, GraphPosition> {
  if (!project.nodes.length) return {};

  const nodeIds = new Set(project.nodes.map((node) => node.id));
  const validEdges = project.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  const primaryParent = new Map<string, string>();
  for (const edge of validEdges) {
    if (edge.to === project.entryNodeId) continue;
    if (!primaryParent.has(edge.to)) primaryParent.set(edge.to, edge.from);
  }

  const primaryChildren = new Map<string, string[]>();
  for (const edge of validEdges) {
    if (primaryParent.get(edge.to) !== edge.from) continue;
    const children = primaryChildren.get(edge.from) ?? [];
    if (!children.includes(edge.to)) children.push(edge.to);
    primaryChildren.set(edge.from, children);
  }

  const occupied = new Map<number, Set<number>>();
  const positions: Record<string, GraphPosition> = {};
  const placed = new Set<string>();
  const visiting = new Set<string>();

  const reserveLane = (depth: number, desired: number, preferredDirection: number) => {
    const used = occupied.get(depth) ?? new Set<number>();
    occupied.set(depth, used);
    if (!used.has(desired)) {
      used.add(desired);
      return desired;
    }

    for (let step = 1; step < project.nodes.length + 3; step += 1) {
      const primary = desired + preferredDirection * step;
      if (!used.has(primary)) {
        used.add(primary);
        return primary;
      }
      const alternate = desired - preferredDirection * step;
      if (!used.has(alternate)) {
        used.add(alternate);
        return alternate;
      }
    }

    const fallback = desired + used.size + 1;
    used.add(fallback);
    return fallback;
  };

  const place = (nodeId: string, depth: number, desiredLane: number, preferredDirection = 1) => {
    if (placed.has(nodeId) || visiting.has(nodeId)) return;
    visiting.add(nodeId);

    const lane = reserveLane(depth, desiredLane, preferredDirection);
    positions[nodeId] = { x: lane * X_GAP, y: depth * Y_GAP };
    placed.add(nodeId);

    const children = primaryChildren.get(nodeId) ?? [];
    children.forEach((childId, index) => {
      const offset = branchLaneOffset(index);
      const childDirection = offset === 0 ? preferredDirection : Math.sign(offset);
      place(childId, depth + 1, lane + offset, childDirection || preferredDirection);
    });

    visiting.delete(nodeId);
  };

  const entry = nodeIds.has(project.entryNodeId) ? project.entryNodeId : project.nodes[0]!.id;
  place(entry, 0, 0, 1);

  let detachedLane = Math.max(
    2,
    ...Object.values(positions).map((position) => Math.round(position.x / X_GAP) + 2),
  );

  for (const node of project.nodes) {
    if (placed.has(node.id)) continue;
    place(node.id, 0, detachedLane, 1);
    detachedLane += 2;
  }

  return positions;
}
