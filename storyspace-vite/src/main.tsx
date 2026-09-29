import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { NavigationProvider } from './state/navigation';
import { ProjectProvider } from './state/project';
import { installBrowserGestureGuards } from './platform/browserGestures';
import './styles.css';
import './surface.css';

installBrowserGestureGuards();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectProvider>
      <NavigationProvider>
        <App />
      </NavigationProvider>
    </ProjectProvider>
  </StrictMode>,
);
