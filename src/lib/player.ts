import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

export interface Player {
  playing: boolean;
  media: MutableRefObject<HTMLMediaElement | null>;
  start: () => void;
  pause: () => void;
  restart: () => void;
}

/** Песня дня для показа: свой аудиоэлемент по url фрагмента. Без файла — тишина. */
export function usePlayer(url?: string): Player {
  const media = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!url) return;
    const a = new Audio();
    a.loop = true;
    a.preload = 'auto';
    a.src = url;
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    media.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      if (media.current === a) media.current = null;
      setPlaying(false);
    };
  }, [url]);

  const start = useCallback(() => {
    const m = media.current;
    if (m) void m.play().catch(() => {});
    else setPlaying(true);
  }, []);
  const pause = useCallback(() => {
    const m = media.current;
    if (m) m.pause();
    else setPlaying(false);
  }, []);
  const restart = useCallback(() => {
    const m = media.current;
    if (m) m.currentTime = 0;
    start();
  }, [start]);

  return { playing, media, start, pause, restart };
}
