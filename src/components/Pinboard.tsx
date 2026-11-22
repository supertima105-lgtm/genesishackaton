import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { useDayAspect } from '../lib/aspect';
import { thumbCached, thumbUrl } from '../lib/thumb';
import type { DayRecord, FileRef } from '../lib/types';
import { formatDate, MemoryCard } from './memory/MemoryCard';
import { freshCover, sheetRatio } from './memory/layout';
import { Fastener, handOf, useEmotion } from './memory/Material';

/**
 * Стена с приколотыми днями. Листы разного формата висят рядом: горизонтальный кадр — шире и ниже,
 * вертикальный — уже и выше, площадь у всех примерно одна. Все приколоты по верхнему краю,
 * поэтому низ у ряда неровный — как у настоящих снимков на кнопках.
 */
export function Pinboard({ children }: { children: ReactNode }) {
  return <div className="pinboard">{children}</div>;
}

const TILTS = [-2.4, 1.8, -1.2, 2.2, -1.8, 1.1];

/** Ширина листа относительно соседей: равная площадь — ширина растёт как корень из пропорции. */
const widthK = (ratio: number) => Math.min(1.25, Math.max(0.84, Math.sqrt(ratio / 0.75)));

/** Карточка дорисовывается, только когда до неё почти доскроллили: год из 300+ дней не строится разом. */
function useNear<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/** Уменьшенная копия файла с общим кэшем; при смене файла (новая обложка) старая картинка держится, пока не готова новая. */
export function useThumb(ref: FileRef | undefined, side: number, on = true) {
  const key = ref?.path;
  const [state, setState] = useState(() => ({ key, url: thumbCached(ref, side) }));
  const hit = state.key === key ? state.url : thumbCached(ref, side);
  useEffect(() => {
    if (!on || !ref || hit) return;
    let alive = true;
    thumbUrl(ref, side)
      .then((u) => alive && setState({ key, url: u }))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key, hit, side]);
  return hit ?? state.url;
}

export const DAY_MIME = 'application/x-diary-day';

/** День на стене — полароид на кнопке, у каждого свой наклон. */
export function PinnedCard({
  day,
  number,
  index,
  extra,
  onDrag,
}: {
  day: DayRecord;
  number: number;
  index: number;
  /** уголок с действиями (в папку, убрать из папки) — поверх карточки, вне ссылки */
  extra?: ReactNode;
  onDrag?: (id: string | null) => void;
}) {
  const [box, near] = useNear<HTMLDivElement>();
  const cover = freshCover(day);
  const src = useThumb(cover ?? day.photos[0], 640, near);
  const ratio = sheetRatio(day.style.layout.frame, useDayAspect(day));
  const emo = useEmotion(day);
  const dragStart = (e: DragEvent) => {
    e.dataTransfer.setData(DAY_MIME, day.id);
    e.dataTransfer.setData('text/plain', day.title);
    e.dataTransfer.effectAllowed = 'copyMove';
    onDrag?.(day.id);
  };

  return (
    <div ref={box} className="pin-slot group relative" style={{ '--k': widthK(ratio).toFixed(3) } as CSSProperties}>
      <a href={`#/day/${encodeURIComponent(day.id)}`} className="block" draggable onDragStart={dragStart} onDragEnd={() => onDrag?.(null)}>
        <div
          className="polaroid rotate-(--tilt) pb-3 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-0"
          style={{ '--tilt': `${TILTS[index % TILTS.length]}deg` } as CSSProperties}
        >
          {/* чем приколот — по настроению дня: скобы, скрепка, скотч, латунная кнопка */}
          <Fastener e={emo} accent={day.style.palette.accent} seed={day.style.shapes.seed} />
          {near ? (
            <MemoryCard day={day} number={number} photoUrls={src && !cover ? [src] : []} coverUrl={cover ? src : undefined} />
          ) : (
            <div className="w-full" style={{ aspectRatio: ratio, background: day.style.palette.paper }} />
          )}
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="truncate leading-tight" style={handOf(emo)}>
              {day.title}
            </span>
            <span className="label shrink-0">{formatDate(day.date).short}</span>
          </div>
        </div>
      </a>
      {extra}
    </div>
  );
}
