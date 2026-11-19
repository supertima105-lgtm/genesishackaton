import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Clock } from '../components/memory/layout';
import { readLevels, resumeAudio, synthLevels, ZERO_LEVELS } from './liveAudio';
import type { DayRecord } from './types';

export interface Player {
  clock: Clock;
  playing: boolean;
  playKey: number;
  media: MutableRefObject<HTMLMediaElement | null>;
  bindMedia: (el: HTMLMediaElement | null) => void;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
}

/**
 * Часы страницы дня. Если есть фрагмент песни — время и живой звук берутся из него,
 * иначе из собственного таймера (а «звук» строится из темпа песни).
 * url — свой аудиоэлемент (архив, сравнение, показ); без url элемент передаёт плеер с волной.
 */
export function usePlayer(day: DayRecord, url?: string): Player {
  const media = useRef<HTMLMediaElement | null>(null);
  const fb = useRef({ playing: false, base: 0, startedAt: 0 });
  const [playing, setPlaying] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const music = useRef(day.signals.music);
  music.current = day.signals.music;
  const bpm = useRef(day.style.motion.bpm);
  bpm.current = day.style.motion.bpm;

  const bindMedia = useCallback((el: HTMLMediaElement | null) => {
    media.current = el;
    if (el) {
      el.onplay = () => setPlaying(true);
      el.onpause = () => setPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    const a = new Audio();
    if (/^https?:/.test(url)) a.crossOrigin = 'anonymous'; // иначе звук с другого домена нельзя анализировать
    a.loop = true;
    a.preload = 'auto';
    a.src = url;
    bindMedia(a);
    return () => {
      a.pause();
      a.removeAttribute('src');
      if (media.current === a) media.current = null;
      setPlaying(false);
    };
  }, [url, bindMedia]);

  const clock = useMemo<Clock>(() => {
    const time = () => {
      const m = media.current;
      if (m) return m.currentTime;
      const f = fb.current;
      return f.playing ? f.base + (performance.now() - f.startedAt) / 1000 : f.base;
    };
    const isPlaying = () => {
      const m = media.current;
      return m ? !m.paused : fb.current.playing;
    };
    return {
      time,
      playing: isPlaying,
      levels: () => {
        if (!isPlaying()) return ZERO_LEVELS;
        const m = media.current;
        const live = m ? readLevels(m) : null;
        if (live) return live;
        const mu = music.current;
        return synthLevels(time(), bpm.current, mu.beatOffset, mu.energy);
      },
    };
  }, []);

  const start = useCallback(() => {
    resumeAudio();
    const m = media.current;
    if (m) void m.play().catch(() => {});
    else {
      fb.current.startedAt = performance.now();
      fb.current.playing = true;
      setPlaying(true);
    }
  }, []);
  const pause = useCallback(() => {
    const m = media.current;
    if (m) m.pause();
    else if (fb.current.playing) {
      const f = fb.current;
      f.base += (performance.now() - f.startedAt) / 1000;
      f.playing = false;
      setPlaying(false);
    }
  }, []);
  const restart = useCallback(() => {
    const m = media.current;
    if (m) m.currentTime = 0;
    fb.current.base = 0;
    fb.current.startedAt = performance.now();
    setPlayKey((k) => k + 1);
    start();
  }, [start]);
  const toggle = useCallback(() => {
    if (clock.playing()) return pause();
    if (clock.time() < 0.3) setPlayKey((k) => k + 1);
    start();
  }, [clock, pause, start]);

  return { clock, playing, playKey, media, bindMedia, start, pause, toggle, restart };
}
