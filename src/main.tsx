import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

if (import.meta.env.DEV) {
  import('./lib/devSeed').then(({ seedDemo }) => {
    (window as unknown as { __seedDemo: typeof seedDemo }).__seedDemo = seedDemo;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
