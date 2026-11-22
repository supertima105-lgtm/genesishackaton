import { useEffect, useState } from 'react';
import { Archive } from './pages/Archive';
import { CalendarPage } from './pages/CalendarPage';
import { ComparePage } from './pages/ComparePage';
import { DayPage } from './pages/DayPage';
import { NewDay } from './pages/NewDay';
import { ShowPage } from './pages/ShowPage';
import { SystemPage } from './pages/SystemPage';

function useRoute() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    let prev = location.hash;
    const f = () => {
      // листая календарь, остаёмся на месте — книга не должна «прыгать» вверх
      const stay = prev.startsWith('#/calendar') && location.hash.startsWith('#/calendar');
      prev = location.hash;
      setHash(location.hash);
      if (!stay) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

export function App() {
  const route = useRoute();
  const dayMatch = route.match(/^\/day\/([^/]+)(?:\/kino)?$/); // старые ссылки на кинорежим ведут на страницу дня
  const cmpMatch = route.match(/^\/compare(?:\/([^/]+))?(?:\/([^/]+))?$/);
  const calMatch = route.match(/^\/calendar(?:\/(\d{4}(?:-\d{2})?))?$/);
  const newMatch = route.match(/^\/new(?:\?date=(\d{4}-\d{2}-\d{2}))?$/);
  const show = route === '/show';

  const tab = (on: boolean, extra = '') =>
    `rounded-sm px-3 pt-1 pb-1.5 font-hand text-[21px] leading-none shadow-[0_2px_0_rgba(0,0,0,.08)] transition-transform hover:-translate-y-0.5 odd:-rotate-[1.5deg] even:rotate-[1.2deg] ${on ? 'bg-note' : 'bg-paper'} ${extra}`;

  return (
    <div className="min-h-screen px-2 pb-12 sm:px-6">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-2 pt-6 pb-5 sm:px-2">
        <a href="#/" className="block -rotate-2">
          <div className="font-hand text-5xl leading-none font-bold text-blue">Атмосфера</div>
          <div className="mt-1 rotate-1 font-mono text-[11px] text-ink-soft">дневник, который помнит, как ощущался день</div>
        </a>
        <nav className="flex flex-wrap items-center gap-2">
          <a href="#/" className={tab(route === '/')}>
            архив
          </a>
          <a href="#/calendar" className={tab(Boolean(calMatch))}>
            календарь
          </a>
          <a href="#/compare" className={tab(Boolean(cmpMatch), 'hidden md:inline-block')}>
            сравнить
          </a>
          <a href="#/show" className={tab(show, 'hidden md:inline-block')}>
            показ
          </a>
          <a href="#/system" className={tab(route === '/system', 'hidden sm:inline-block')}>
            как это работает
          </a>
          <a href="#/new" className="rounded-sm bg-blue px-3 pt-1 pb-1.5 font-hand text-[21px] leading-none text-white shadow-[0_2px_0_rgba(0,0,0,.12)] transition-transform hover:-translate-y-0.5">
            + новый день
          </a>
        </nav>
      </header>
      <main className={calMatch || show ? 'mx-auto max-w-7xl px-2 pt-2 sm:px-4' : 'sheet mx-auto max-w-7xl px-4 py-8 sm:px-8'}>
        {show ? (
          <ShowPage />
        ) : newMatch ? (
          <NewDay key={route} initialDate={newMatch[1]} />
        ) : calMatch ? (
          <CalendarPage period={calMatch[1]} />
        ) : route === '/system' ? (
          <SystemPage />
        ) : cmpMatch ? (
          <ComparePage key={route} a={cmpMatch[1] && decodeURIComponent(cmpMatch[1])} b={cmpMatch[2] && decodeURIComponent(cmpMatch[2])} />
        ) : dayMatch ? (
          <DayPage id={decodeURIComponent(dayMatch[1])} />
        ) : (
          <Archive />
        )}
      </main>
    </div>
  );
}
