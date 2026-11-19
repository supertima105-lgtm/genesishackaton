import { useEffect, useState } from 'react';
import { Archive } from './pages/Archive';
import { ComparePage } from './pages/ComparePage';
import { DayPage } from './pages/DayPage';
import { NewDay } from './pages/NewDay';
import { ShowPage } from './pages/ShowPage';
import { SystemPage } from './pages/SystemPage';

function useRoute() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const f = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

export function App() {
  const route = useRoute();
  const dayMatch = route.match(/^\/day\/([^/]+)(\/kino)?$/);
  const cmpMatch = route.match(/^\/compare(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (route === '/show') return <ShowPage />;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-end justify-between gap-6 px-4 pt-8 pb-6 sm:px-8">
        <a href="#/" className="group">
          <div className="font-serif text-4xl leading-none tracking-tight">Атмосфера</div>
          <div className="label mt-2">дневник, который помнит, как ощущался день</div>
        </a>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a href="#/" className={`label px-2 py-1 ${route === '/' ? 'text-ink underline underline-offset-4' : ''}`}>
            Архив
          </a>
          <a href="#/compare" className={`label hidden px-2 py-1 md:inline ${cmpMatch ? 'text-ink underline underline-offset-4' : ''}`}>
            Сравнить
          </a>
          <a href="#/show" className="label hidden px-2 py-1 md:inline">
            Показ
          </a>
          <a href="#/system" className={`label hidden px-2 py-1 sm:inline ${route === '/system' ? 'text-ink underline underline-offset-4' : ''}`}>
            Система
          </a>
          <a href="#/new" className="btn btn-solid">
            + День
          </a>
        </nav>
      </header>
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="h-px bg-line" />
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {route === '/new' ? (
          <NewDay />
        ) : route === '/system' ? (
          <SystemPage />
        ) : cmpMatch ? (
          <ComparePage key={route} a={cmpMatch[1] && decodeURIComponent(cmpMatch[1])} b={cmpMatch[2] && decodeURIComponent(cmpMatch[2])} />
        ) : dayMatch ? (
          <DayPage id={decodeURIComponent(dayMatch[1])} kino={Boolean(dayMatch[2])} />
        ) : (
          <Archive />
        )}
      </main>
    </div>
  );
}
