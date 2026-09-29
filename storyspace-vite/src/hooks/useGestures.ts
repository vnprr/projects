import { useRef } from 'react';

type SwipeOptions = {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  threshold?: number;
};

export function useSwipe({ onLeft, onRight, onUp, onDown, threshold = 56 }: SwipeOptions) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const lastSwipeAt = useRef(0);

  const bind = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.pointerType !== 'touch') return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const origin = start.current;
      start.current = null;
      if (!origin || origin.id !== event.pointerId) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
      event.preventDefault();
      lastSwipeAt.current = performance.now();
      if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? onLeft : onRight)?.();
      else (dy < 0 ? onUp : onDown)?.();
    },
    onPointerCancel() {
      start.current = null;
    },
  };

  return {
    bind,
    didSwipeRecently: () => performance.now() - lastSwipeAt.current < 420,
  };
}

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
