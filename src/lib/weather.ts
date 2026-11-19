import type { WeatherSignals } from './types';

/**
 * Погода дня через Open-Meteo (без ключа). Запрашивается только с согласия пользователя:
 * координаты берутся из геолокации браузера и округляются до ~1 км.
 */
export function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('геолокация недоступна'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) }),
      (e) => reject(new Error(e.message || 'нет доступа к геолокации')),
      { timeout: 10000, maximumAge: 3600_000 },
    );
  });
}

const round = (v: number) => Math.round(v * 100) / 100;

export async function fetchWeather(date: string, lat: number, lon: number): Promise<WeatherSignals | null> {
  const daysAgo = (Date.now() - new Date(date + 'T12:00:00').getTime()) / 86_400_000;
  if (daysAgo < -14) return null; // будущее — прогноза ещё нет
  const base = daysAgo > 80 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: date,
    end_date: date,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration',
    timezone: 'auto',
  });
  const r = await fetch(`${base}?${q}`);
  if (!r.ok) return null;
  const d = (await r.json()).daily;
  if (!d?.weather_code?.length || d.weather_code[0] == null) return null;
  const code = Number(d.weather_code[0]);
  const { kind, label } = classify(code);
  return {
    kind,
    label,
    code,
    tempMax: Math.round(d.temperature_2m_max[0]),
    tempMin: Math.round(d.temperature_2m_min[0]),
    precipitation: Number(d.precipitation_sum[0] ?? 0),
    sunshineHours: Math.round(Number(d.sunshine_duration[0] ?? 0) / 360) / 10,
  };
}

function classify(code: number): Pick<WeatherSignals, 'kind' | 'label'> {
  if (code === 0) return { kind: 'clear', label: 'ясно' };
  if (code <= 2) return { kind: 'clear', label: 'малооблачно' };
  if (code === 3) return { kind: 'cloudy', label: 'пасмурно' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'туман' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'снег' };
  if (code >= 95) return { kind: 'storm', label: 'гроза' };
  if (code >= 51 && code <= 57) return { kind: 'rain', label: 'морось' };
  return { kind: 'rain', label: 'дождь' };
}

export function weatherShort(w: WeatherSignals) {
  const t = Math.round((w.tempMax + w.tempMin) / 2);
  return `${t > 0 ? '+' : ''}${t}° · ${w.label}`;
}
