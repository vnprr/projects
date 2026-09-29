import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { NavigationProvider } from './state/navigation';
import { ProjectProvider } from './state/project';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectProvider>
      <NavigationProvider>
        <App />
      </NavigationProvider>
    </ProjectProvider>
  </StrictMode>,
);
