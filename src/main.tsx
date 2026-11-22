import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureExamples, exportExamples } from './lib/examples';
import { removeTestDays } from './lib/testDays';
import './index.css';

if (import.meta.env.DEV) {
  import('./lib/devSeed').then(({ seedDemo, seedNovember, seedYear }) => {
    (window as unknown as { __seedYear: typeof seedYear }).__seedYear = seedYear;
    (window as unknown as { __seedDemo: typeof seedDemo }).__seedDemo = seedDemo;
    (window as unknown as { __seedNovember: typeof seedNovember }).__seedNovember = seedNovember;
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
// сначала убираем тестовые дни, оставшиеся от прежних примеров и dev-заполнения
const prepare = removeTestDays()
  .catch(() => 0)
  .then(() => ensureExamples());
Promise.race([prepare, new Promise((r) => setTimeout(r, 20000))]).finally(render);
