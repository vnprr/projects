const zoomKeys = new Set(['+', '=', '-', '_', '0']);

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function installBrowserGestureGuards() {
  const preventGesture = (event: Event) => event.preventDefault();
  const preventWheelZoom = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };
  const preventKeyboardZoom = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && zoomKeys.has(event.key)) event.preventDefault();
  };
  const preventDoubleTapZoom = (event: MouseEvent) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  };

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
  document.addEventListener('wheel', preventWheelZoom, { passive: false });
  document.addEventListener('keydown', preventKeyboardZoom, { passive: false });
  document.addEventListener('dblclick', preventDoubleTapZoom, { passive: false });

  return () => {
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
    document.removeEventListener('gestureend', preventGesture);
    document.removeEventListener('wheel', preventWheelZoom);
    document.removeEventListener('keydown', preventKeyboardZoom);
    document.removeEventListener('dblclick', preventDoubleTapZoom);
  };
}
