# Storyspace — mobile notebook reset

Mobile-first prototype with one black, full-screen plain-text editor and a left notes drawer. Create and switch notes. Autosave to localStorage (200ms debounce + pagehide flush).

No graph, camera, React Flow, ELK, semantic navigation gestures or graphics dependencies. Old data in storyspace.alpha.workspace.v3 is preserved untouched. New notes use storyspace.mobile-notebook.v1.

## Start

npm install
npm run dev
npm run build

## Architecture

Use the browser's native textarea for mobile keyboard, IME, selection, caret and accessibility. Add a separate SVG + Motion graphics layer only when the design needs it; profile before considering PixiJS. The editor itself must remain independent from the graphics engine.
