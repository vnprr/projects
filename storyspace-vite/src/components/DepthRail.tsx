import type { NavigationLevel } from '../domain/types';
import { useNavigation } from '../state/navigation';

const levels: NavigationLevel[] = ['canvas', 'note'];

export function DepthRail() {
  const { state, setLevel } = useNavigation();

  return (
    <nav className="depth-rail" aria-label="Workspace depth">
      {levels.map((level) => (
        <button
          key={level}
          className={state.currentLevel === level ? 'is-active' : ''}
          onClick={() => setLevel(level)}
          aria-label={level === 'canvas' ? 'Open graph' : 'Open note'}
        >
          <span />
        </button>
      ))}
    </nav>
  );
}
