# Storyspace — semantic pinch prototype (mobile-first)

React 19 + TypeScript + Vite + **Motion for React**.

- One DOM-based writing surface; its whole parent (`.world`) owns a single animated MotionValue `scale`.
- Pinch closes/open fingers to continuously change scale from `1` to `.72` without changing font-size; a spring snaps to the nearest mode on release.
- When zoomed out, see container border, SVG links and nearby scene titles; tap a linked title to navigate.
- Two links from the corridor demonstrate a branch; all scenes contain editable title and plain text.
- Left menu lists scenes and allows creating a new scene connected to the current scene.
- LocalStorage autosave, previous notebook migration, pagehide flush. Original storage remains untouched.
- Desktop fallback: top-right zoom icon or Ctrl/Cmd + scroll gesture.

`npm install && npm run dev` then `npm run build`.

The editor remains native HTML so text selection and mobile keyboard behavior aren't rendered through WebGL or Canvas. Motion handles only the transform and reveal. Future: zoom-anchoring, horizontal branches and persistent graph state.
