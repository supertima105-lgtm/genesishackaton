import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { measureAspect } from '../lib/aspect';
import { restyle, saveCover } from '../lib/pipeline';
import { patchDay, store } from '../lib/storage';
import type { DayRecord } from '../lib/types';
import { DEFAULT_ASPECT, frameOf, freshCover } from './memory/layout';
import { PhotoLayer } from './memory/PhotoLayer';

interface Job {
  day: DayRecord;
  url: string;
  w: number;
  h: number;
}

/**
 * Обложки, снятые под прежний лист 4:5, не подходят к окну фото в формате снимка. Их пересъёмка —
 * в фоне и по одной: кадр в почерке дня рисуется за краем экрана, снимок сохраняется, берётся следующий.
 */
export function CoverBaker() {
  const [queue, setQueue] = useState<DayRecord[] | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      store
        .list()
        .then((l) => Promise.all(l.map(unbendStyle)))
        .then((l) => alive && setQueue(l.filter((d) => d.photos.length > 0 && !freshCover(d))))
        .catch(() => {});
    }, 1200);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);

  const drop = (id: string) => {
    setQueue((q) => (q ? q.filter((d) => d.id !== id) : q));
    setJob(null);
  };

  useEffect(() => {
    if (job || !queue?.length) return;
    const id = queue[0].id;
    let alive = true;
    (async () => {
      const day = await store.get(id);
      if (!day || freshCover(day) || !day.photos.length) return alive && drop(id);
      const f = frameOf(day.style.layout.frame, (await measureAspect(day)) ?? DEFAULT_ASPECT);
      const url = await store.fileUrl(day.photos[0]);
      const w = 640;
      if (alive) setJob({ day, url, w, h: Math.round((w * f.h) / f.w) });
    })().catch(() => alive && drop(id));
    return () => {
      alive = false;
    };
  }, [job, queue]);

  // кадр так и не нарисовался — не держим очередь. Первый шейдер на холодную компилируется долго,
  // поэтому день не выбрасываем сразу, а ставим ещё раз в конец очереди.
  const retried = useRef(new Set<string>());
  useEffect(() => {
    if (!job) return;
    const id = job.day.id;
    const t = window.setTimeout(() => {
      if (retried.current.has(id)) return drop(id);
      retried.current.add(id);
      setQueue((q) => (q ? [...q.filter((d) => d.id !== id), job.day] : q));
      setJob(null);
    }, 30000);
    return () => window.clearTimeout(t);
  }, [job]);

  if (!job) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', left: -12000, top: 0, width: job.w, height: job.h, pointerEvents: 'none' }}>
      <Quiet onError={() => drop(job.day.id)}>
        <PhotoLayer
          key={job.day.id}
          url={job.url}
          style={job.day.style}
          seed={job.day.style.shapes.seed}
          onCover={(b) => {
            void saveCover(job.day, b)
              .catch(() => {})
              .finally(() => drop(job.day.id));
          }}
        />
      </Quiet>
    </div>
  );
}

/**
 * У дней с поправленными ползунками почерк кадра строится от ощущения человека. Если записанный стиль
 * сложился по прежним правилам — пересобираем его под поправку и снимаем обложку заново.
 */
async function unbendStyle(d: DayRecord): Promise<DayRecord> {
  if (!d.axesOverride || !Object.keys(d.axesOverride).length) return d;
  const { style, reasons, axes } = restyle(d, d.axesOverride);
  if (JSON.stringify(style) === JSON.stringify(d.style)) return d;
  const patch = { style, reasons, axes, cover: undefined, video: undefined };
  await patchDay(d.id, patch);
  return { ...d, ...patch };
}

/** Ошибка фоновой пересъёмки не должна ронять страницу. */
class Quiet extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
