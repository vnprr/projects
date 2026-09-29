import { useEffect, useRef } from 'react';

type Direction = 'next' | 'previous';

type FlowMotionOptions = {
  canNext: boolean;
  canPrevious: boolean;
  canBranch: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onBranch: (delta: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

type PointerState = {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  velocityX: number;
  velocityY: number;
  axis: 'x' | 'y' | null;
  moved: boolean;
};

const EXIT_MS = 150;
const ENTER_MS = 240;
const DRAG_LOCK_PX = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useFlowMotion(options: FlowMotionOptions) {
  const trackRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  const pointerRef = useRef<PointerState | null>(null);
  const wheelRef = useRef({ amount: 0, resetTimer: 0 as number | null });
  const zoomWheelRef = useRef({ amount: 0, resetTimer: 0 as number | null });
  const animationTimers = useRef<number[]>([]);
  const animatingRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  optionsRef.current = options;

  const clearAnimationTimers = () => {
    animationTimers.current.forEach((timer) => window.clearTimeout(timer));
    animationTimers.current = [];
  };

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    animationTimers.current.push(timer);
    return timer;
  };

  const applyMotion = (x: number, y = 0, animate = false) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      const width = Math.max(window.innerWidth, 1);
      const progress = clamp(Math.abs(x) / Math.max(width * 0.46, 280), 0, 1);
      track.style.setProperty('--flow-x', `${x}px`);
      track.style.setProperty('--flow-y', `${y}px`);
      track.style.setProperty('--flow-progress', String(progress));
      track.classList.toggle('is-animating', animate);
      track.classList.toggle('is-dragging', !animate && (Math.abs(x) > 0.5 || Math.abs(y) > 0.5));
    });
  };

  const snapBack = () => {
    applyMotion(0, 0, true);
    schedule(() => trackRef.current?.classList.remove('is-animating'), ENTER_MS);
  };

  const commit = (direction: Direction) => {
    if (animatingRef.current) return;

    const currentOptions = optionsRef.current;
    const allowed = direction === 'next' ? currentOptions.canNext : currentOptions.canPrevious;
    if (!allowed) {
      snapBack();
      return;
    }

    animatingRef.current = true;
    suppressClickUntilRef.current = performance.now() + 520;
    clearAnimationTimers();

    const viewport = window.innerWidth;
    const exitDistance = clamp(viewport * 0.56, 300, 760);
    const enterDistance = clamp(viewport * 0.16, 72, 150);
    const sign = direction === 'next' ? -1 : 1;

    applyMotion(sign * exitDistance, 0, true);

    schedule(() => {
      if (direction === 'next') currentOptions.onNext();
      else currentOptions.onPrevious();

      applyMotion(-sign * enterDistance, 0, false);
      requestAnimationFrame(() => requestAnimationFrame(() => applyMotion(0, 0, true)));

      schedule(() => {
        animatingRef.current = false;
        applyMotion(0, 0, false);
      }, ENTER_MS + 24);
    }, EXIT_MS);
  };

  const nudgeBranch = (delta: number) => {
    if (!optionsRef.current.canBranch || animatingRef.current) return;
    suppressClickUntilRef.current = performance.now() + 300;
    optionsRef.current.onBranch(delta);
    applyMotion(0, delta > 0 ? -24 : 24, false);
    requestAnimationFrame(() => requestAnimationFrame(() => applyMotion(0, 0, true)));
    schedule(() => applyMotion(0, 0, false), 180);
  };

  const resetPointer = () => {
    pointerRef.current = null;
  };

  const bind = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (animatingRef.current) return;
      if (!event.isPrimary) {
        resetPointer();
        snapBack();
        return;
      }

      const now = performance.now();
      pointerRef.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastAt: now,
        velocityX: 0,
        velocityY: 0,
        axis: null,
        moved: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const pointer = pointerRef.current;
      if (!pointer || pointer.id !== event.pointerId || animatingRef.current) return;

      const dx = event.clientX - pointer.startX;
      const dy = event.clientY - pointer.startY;
      const distance = Math.hypot(dx, dy);

      if (!pointer.axis && distance >= DRAG_LOCK_PX) {
        pointer.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      if (!pointer.axis) return;

      const now = performance.now();
      const elapsed = Math.max(8, now - pointer.lastAt);
      pointer.velocityX = (event.clientX - pointer.lastX) / elapsed;
      pointer.velocityY = (event.clientY - pointer.lastY) / elapsed;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.lastAt = now;
      pointer.moved = true;

      if (pointer.axis === 'x') {
        event.preventDefault();
        const movingTowardNext = dx < 0;
        const allowed = movingTowardNext ? optionsRef.current.canNext : optionsRef.current.canPrevious;
        applyMotion(dx * (allowed ? 1 : 0.18), 0, false);
        return;
      }

      if (pointer.axis === 'y' && optionsRef.current.canBranch) {
        event.preventDefault();
        applyMotion(0, clamp(dy * 0.26, -36, 36), false);
      }
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const pointer = pointerRef.current;
      resetPointer();
      if (!pointer || pointer.id !== event.pointerId || animatingRef.current) return;
      if (!pointer.moved || !pointer.axis) return;

      suppressClickUntilRef.current = performance.now() + 420;
      const dx = event.clientX - pointer.startX;
      const dy = event.clientY - pointer.startY;

      if (pointer.axis === 'x') {
        const threshold = Math.min(96, window.innerWidth * 0.22);
        const fastFlick = Math.abs(pointer.velocityX) > 0.52 && Math.abs(dx) > 24;
        if (Math.abs(dx) >= threshold || fastFlick) commit(dx < 0 ? 'next' : 'previous');
        else snapBack();
        return;
      }

      if (pointer.axis === 'y' && optionsRef.current.canBranch) {
        const fastFlick = Math.abs(pointer.velocityY) > 0.42 && Math.abs(dy) > 18;
        if (Math.abs(dy) >= 46 || fastFlick) nudgeBranch(dy < 0 ? 1 : -1);
        else snapBack();
      }
    },
    onPointerCancel() {
      resetPointer();
      if (!animatingRef.current) snapBack();
    },
    onWheel(event: React.WheelEvent<HTMLElement>) {
      event.preventDefault();
      if (animatingRef.current) return;

      if (event.ctrlKey || event.metaKey) {
        const zoom = zoomWheelRef.current;
        zoom.amount += -event.deltaY;
        if (zoom.resetTimer) window.clearTimeout(zoom.resetTimer);
        zoom.resetTimer = window.setTimeout(() => {
          zoom.amount = 0;
          zoom.resetTimer = null;
        }, 140);
        if (Math.abs(zoom.amount) > 74) {
          const zoomIn = zoom.amount > 0;
          zoom.amount = 0;
          zoomIn ? optionsRef.current.onZoomIn() : optionsRef.current.onZoomOut();
        }
        return;
      }

      const wheel = wheelRef.current;
      const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.65 ? event.deltaX : event.deltaY;
      if (Math.abs(raw) < 0.5) return;

      const multiplier = event.deltaMode === 1 ? 14 : event.deltaMode === 2 ? window.innerHeight : 1;
      wheel.amount = clamp(wheel.amount + raw * multiplier, -150, 150);
      applyMotion(clamp(-wheel.amount * 0.72, -118, 118), 0, false);

      if (wheel.resetTimer) window.clearTimeout(wheel.resetTimer);
      wheel.resetTimer = window.setTimeout(() => {
        const amount = wheel.amount;
        wheel.amount = 0;
        wheel.resetTimer = null;
        if (Math.abs(amount) >= 62) commit(amount > 0 ? 'next' : 'previous');
        else snapBack();
      }, 108);
    },
  };

  useEffect(() => {
    return () => {
      clearAnimationTimers();
      if (wheelRef.current.resetTimer) window.clearTimeout(wheelRef.current.resetTimer);
      if (zoomWheelRef.current.resetTimer) window.clearTimeout(zoomWheelRef.current.resetTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    trackRef,
    bind,
    commitNext: () => commit('next'),
    commitPrevious: () => commit('previous'),
    nudgeBranch,
    canActivate: () => !animatingRef.current && performance.now() >= suppressClickUntilRef.current,
  };
}
