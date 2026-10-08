import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { sampleProject } from '../domain/sampleProject';
import type { NavigationLevel, NavigationState } from '../domain/types';

const initialState: NavigationState = {
  currentNodeId: sampleProject.entryNodeId,
  currentLevel: 'note',
  history: [],
  motion: 'idle',
};

type NavigationContextValue = {
  state: NavigationState;
  goToNode: (nodeId: string, direction?: 'forward' | 'backward') => void;
  goBack: () => void;
  setLevel: (level: NavigationLevel) => void;
  focusCanvasNode: (nodeId: string) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(initialState);

  const goToNode = useCallback((nodeId: string, direction: 'forward' | 'backward' = 'forward') => {
    setState((current) => {
      if (nodeId === current.currentNodeId) return current;
      return {
        ...current,
        currentNodeId: nodeId,
        history: [...current.history, current.currentNodeId].slice(-64),
        motion: direction,
      };
    });
  }, []);

  const goBack = useCallback(() => {
    setState((current) => {
      const previous = current.history.at(-1);
      if (!previous) return current;
      return {
        ...current,
        currentNodeId: previous,
        history: current.history.slice(0, -1),
        motion: 'backward',
      };
    });
  }, []);

  const setLevel = useCallback((level: NavigationLevel) => {
    setState((current) => {
      if (current.currentLevel === level) return current;
      return {
        ...current,
        currentLevel: level,
        motion: level === 'note' ? 'zoom-in' : 'zoom-out',
      };
    });
  }, []);

  const focusCanvasNode = useCallback((currentNodeId: string) => {
    setState((current) => ({ ...current, currentNodeId, motion: 'idle' }));
  }, []);

  const value = useMemo(
    () => ({ state, goToNode, goBack, setLevel, focusCanvasNode }),
    [state, goToNode, goBack, setLevel, focusCanvasNode],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within NavigationProvider');
  return context;
}
