import type { CSSProperties } from 'react';
import { useNavigation } from '../state/navigation';
import { useProject } from '../state/project';

export function Ambient() {
  const { project } = useProject();
  const { state } = useNavigation();
  const hue = project.nodes.find((node) => node.id === state.currentNodeId)?.ambientHue ?? 220;
  return (
    <div className="ambient" style={{ '--ambient-hue': hue } as CSSProperties} aria-hidden="true">
      <div className="ambient-wash ambient-wash-a" />
      <div className="ambient-wash ambient-wash-b" />
      <div className="ambient-grain" />
    </div>
  );
}
