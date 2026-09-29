import { useRef } from 'react';

type PinchOptions = {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  threshold?: number;
};

function touchDistance(touches: React.TouchList) {
  const a = touches.item(0);
  const b = touches.item(1);
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function usePinch({ onZoomIn, onZoomOut, threshold = 0.2 }: PinchOptions) {
  const initial = useRef<number | null>(null);
  const consumed = useRef(false);

  return {
    onTouchStartCapture(event: React.TouchEvent<HTMLElement>) {
      if (event.touches.length === 2) {
        initial.current = touchDistance(event.touches);
        consumed.current = false;
      }
    },
    onTouchMoveCapture(event: React.TouchEvent<HTMLElement>) {
      if (event.touches.length !== 2 || !initial.current || consumed.current) return;
      const ratio = touchDistance(event.touches) / initial.current;
      if (ratio > 1 + threshold && onZoomIn) {
        event.preventDefault();
        consumed.current = true;
        onZoomIn();
      } else if (ratio < 1 - threshold && onZoomOut) {
        event.preventDefault();
        consumed.current = true;
        onZoomOut();
      }
    },
    onTouchEndCapture() {
      initial.current = null;
      consumed.current = false;
    },
  };
}
