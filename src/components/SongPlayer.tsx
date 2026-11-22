import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useSongCover } from '../lib/songCover';
import type { DayRecord } from '../lib/types';

interface Props {
  day: DayRecord;
  excerptUrl?: string;
}

/** Пластинка дня и под ней — фрагмент песни с волной (wavesurfer) или официальный плеер сервиса по ссылке. */
export function SongPlayer({ day, excerptUrl }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const { ink, accent } = day.style.palette;

  useEffect(() => {
    if (!excerptUrl || !box.current) return;
    const el = new Audio();
    if (/^https?:/.test(excerptUrl)) el.crossOrigin = 'anonymous';
    const w = WaveSurfer.create({
      container: box.current,
      media: el,
      url: excerptUrl,
      height: 48,
      waveColor: '#c9b48c',
      progressColor: day.style.palette.dark ? accent : ink,
      cursorWidth: 0,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
    });
    w.on('play', () => setPlaying(true));
    w.on('pause', () => setPlaying(false));
    w.on('finish', () => setPlaying(false));
    ws.current = w;
    return () => {
      ws.current = null;
      setPlaying(false);
      w.destroy();
    };
  }, [excerptUrl, ink, accent, day.style.palette.dark]);

  const embed = day.song.link?.embedUrl;
  const height = day.song.link?.provider === 'spotify' ? 152 : day.song.link?.provider === 'youtube' ? 200 : 120;

  const showEmbed = !excerptUrl && embed;
  const era = day.signals.music.era;
  const cover = useSongCover(day);

  // пластинка дня: винил выглядывает из бумажного конверта
  return (
    <div>
      <div className="label">пластинка дня</div>
      <div className="relative mt-3 aspect-[340/178] w-full max-w-[340px]">
        <div className="absolute top-[5.1%] left-[20%] aspect-square w-[47%] translate-x-[38%]" aria-hidden>
          <div className="vinyl h-full w-full" style={{ '--label': accent } as CSSProperties} />
          <div className="vinyl-sheen" />
        </div>
        <div className="sleeve absolute top-0 left-0 z-10 flex aspect-square w-[52%] -rotate-2 flex-col justify-end overflow-hidden p-[7%]">
          {cover && (
            <>
              <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
              <span className="sleeve-shade" aria-hidden />
            </>
          )}
          <div className={`absolute top-[7%] right-[8%] font-mono text-[10px] ${cover ? 'rounded-full bg-black/35 px-1.5 text-white' : 'text-ink-soft'}`}>
            ♪ {Math.round(day.style.motion.bpm)}
            {era ? ` · ’${String(era).slice(-2)}` : ''}
          </div>
          <div className={`relative ${cover ? 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]' : ''}`}>
            <div className="line-clamp-3 font-hand text-[clamp(22px,7vw,30px)] leading-[0.95] font-bold">{day.song.title}</div>
            <div className="mt-1 truncate font-mono text-[11px]">{day.song.artist}</div>
          </div>
        </div>
      </div>
      {excerptUrl && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="btn shrink-0" onClick={() => void ws.current?.playPause()} aria-label={playing ? 'Пауза' : 'Слушать песню'}>
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Пауза' : 'Слушать'}
          </button>
          <div ref={box} className="min-w-0 flex-1" />
        </div>
      )}
      {showEmbed && (
        <iframe
          title="Песня дня"
          src={embed}
          height={height}
          className="mt-4 w-full rounded-xl border-0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}
      {!excerptUrl && !embed && day.song.link?.url && (
        <a href={day.song.link.url} target="_blank" rel="noreferrer" className="mt-3 inline-block font-hand text-xl text-blue underline underline-offset-4">
          открыть песню
        </a>
      )}
    </div>
  );
}
