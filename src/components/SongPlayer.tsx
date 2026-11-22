import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { songArtist, strayAudio, useSongCover } from '../lib/songCover';
import type { DayRecord } from '../lib/types';

interface Props {
  day: DayRecord;
  excerptUrl?: string;
}

/** Песня дня — одно окошко плеера: официальный плеер сервиса по ссылке или своя мелодия с волной. */
export function SongPlayer({ day, excerptUrl: fileUrl }: Props) {
  // файл мелодии дневника, оставшийся у песни по ссылке, не играем — вместо него плеер по ссылке
  const excerptUrl = strayAudio(day.song) ? undefined : fileUrl;
  const embed = day.song.link?.embedUrl;
  const height = day.song.link?.provider === 'spotify' ? 152 : day.song.link?.provider === 'youtube' ? 200 : 120;

  if (excerptUrl) return <ExcerptWindow day={day} url={excerptUrl} />;
  if (embed)
    return (
      <iframe
        title="Песня дня"
        src={embed}
        height={height}
        className="block w-full rounded-xl border-0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    );
  if (day.song.link?.url)
    return (
      <a href={day.song.link.url} target="_blank" rel="noreferrer" className="inline-block font-hand text-xl text-blue underline underline-offset-4">
        открыть песню
      </a>
    );
  return null;
}

/** Своя мелодия дня: окошко как у плеера сервиса — обложка, название, кнопка и волна. */
function ExcerptWindow({ day, url }: { day: DayRecord; url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const cover = useSongCover(day);

  useEffect(() => {
    if (!box.current) return;
    const el = new Audio();
    if (/^https?:/.test(url)) el.crossOrigin = 'anonymous';
    const w = WaveSurfer.create({
      container: box.current,
      media: el,
      url,
      height: 36,
      waveColor: 'rgba(255,255,255,.28)',
      progressColor: '#f3ecdf',
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
  }, [url]);

  return (
    <div className="flex items-center gap-4 rounded-xl bg-[#3d3735] p-3 text-[#f3ecdf]">
      <div className="h-[96px] w-[96px] shrink-0 overflow-hidden rounded-lg bg-black/25">
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" draggable={false} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{day.song.title}</div>
        <div className="truncate text-[13px] opacity-70">{songArtist(day.song)}</div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void ws.current?.playPause()}
            aria-label={playing ? 'Пауза' : 'Слушать песню'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f3ecdf] text-[#3d3735] transition hover:scale-105"
          >
            {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="translate-x-px" />}
          </button>
          <div ref={box} className="min-w-0 flex-1" />
        </div>
      </div>
    </div>
  );
}
