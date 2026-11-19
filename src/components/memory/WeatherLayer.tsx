import type { CSSProperties } from 'react';
import type { StyleParams } from '../../lib/types';

/** Погода поверх окна фото: дождь, снег, туман или солнечный луч. Чистый CSS — дёшево и плавно. */
export function WeatherLayer({ weather, animate }: { weather?: StyleParams['weather']; animate: boolean }) {
  if (!weather) return null;
  const k = weather.intensity;
  const play = animate ? 'running' : 'paused';
  const layer = (extra: CSSProperties): CSSProperties => ({ position: 'absolute', inset: 0, pointerEvents: 'none', animationPlayState: play, ...extra });

  if (weather.kind === 'rain' || weather.kind === 'storm')
    return (
      <>
        <div className="wx-rain" style={layer({ opacity: 0.25 + k * 0.45, animationDuration: `${0.9 - k * 0.4}s` })} />
        <div className="wx-rain wx-rain-far" style={layer({ opacity: 0.15 + k * 0.3, animationDuration: `${1.4 - k * 0.5}s` })} />
        {weather.kind === 'storm' && <div className="wx-flash" style={layer({})} />}
      </>
    );
  if (weather.kind === 'snow')
    return (
      <>
        <div className="wx-snow" style={layer({ opacity: 0.5 + k * 0.4 })} />
        <div className="wx-snow wx-snow-far" style={layer({ opacity: 0.35 + k * 0.3 })} />
      </>
    );
  if (weather.kind === 'fog') return <div className="wx-fog" style={layer({ opacity: 0.55 })} />;
  return <div className="wx-sun" style={layer({ opacity: 0.25 + k * 0.35 })} />;
}
