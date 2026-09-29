import type { NavigationLevel } from '../domain/types';
import { useNavigation } from '../state/navigation';

const levels: NavigationLevel[] = ['canvas', 'flow', 'note'];

export function DepthRail() {
  const { state, setLevel } = useNavigation();
  return (
    <nav className="depth-rail" aria-label="Semantic zoom level">
      {levels.map((level) => (
        <button key={level} className={state.currentLevel === level ? 'is-active' : ''} onClick={() => setLevel(level)} aria-label={`Open ${level}`}>
          <span />
        </button>
      ))}
    </nav>
  );
}
