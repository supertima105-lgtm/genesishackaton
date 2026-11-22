import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureExamples, exportExamples } from './lib/examples';
import { initSettings } from './lib/settings';
import { initStore } from './lib/storage';
import { removeTestDays } from './lib/testDays';
import './index.css';

if (import.meta.env.DEV) {
  import('./lib/devSeed').then(({ seedDemo, seedNovember, seedYear, seedShowcase }) => {
    (window as unknown as { __seedShowcase: typeof seedShowcase }).__seedShowcase = seedShowcase;
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
// сначала решаем, чей это дневник (аккаунт или этот браузер). В дневнике браузера убираем тестовые дни,
// оставшиеся от прежних примеров и dev-заполнения, и подкладываем примеры; аккаунт человека не трогаем
const prepare = initStore()
  .catch(() => 'local' as const)
  .then((kind) => {
    initSettings();
    return kind;
  })
  .then((kind) =>
    kind === 'local'
      ? removeTestDays()
          .catch(() => 0)
          .then(() => ensureExamples())
      : undefined,
  );
Promise.race([prepare, new Promise((r) => setTimeout(r, 20000))]).finally(render);
