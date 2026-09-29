import { useEffect, useState } from 'react';

export function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(() => window.visualViewport?.height ?? window.innerHeight);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setHeight(Math.round(viewport?.height ?? window.innerHeight));
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return height;
}
