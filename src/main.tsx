import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureExamples, exportExamples } from './lib/examples';
import './index.css';

if (import.meta.env.DEV) {
  import('./lib/devSeed').then(({ seedDemo }) => {
    (window as unknown as { __seedDemo: typeof seedDemo }).__seedDemo = seedDemo;
  });
  (window as unknown as { __exportExamples: typeof exportExamples }).__exportExamples = exportExamples;
}

// пустой дневник при первом открытии получает примеры дней — жюри сразу видит живой архив
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
Promise.race([ensureExamples(), new Promise((r) => setTimeout(r, 20000))]).finally(render);
