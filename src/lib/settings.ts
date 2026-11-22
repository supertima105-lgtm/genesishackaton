import { useEffect, useState } from 'react';
import { currentSession, sb } from './supabase';

/**
 * Настройки дневника. Живут в этом браузере, а у вошедшего человека ещё и в аккаунте
 * (user_metadata.settings) — на телефоне откроется та же тема, что на компьютере.
 */
export type Theme = 'light' | 'dark' | 'system';
export interface Settings {
  theme: Theme;
  bigText: boolean;
}

const KEY = 'settings:v1';
const DEFAULTS: Settings = { theme: 'light', bigText: false };

function readLocal(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = readLocal();
const subs = new Set<(s: Settings) => void>();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function apply(s: Settings) {
  const dark = s.theme === 'dark' || (s.theme === 'system' && Boolean(media?.matches));
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.text = s.bigText ? 'big' : 'normal';
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/** Вызывается до первого рендера: тема из аккаунта перекрывает локальную. */
export function initSettings() {
  const fromAccount = currentSession()?.user.user_metadata?.settings as Partial<Settings> | undefined;
  if (fromAccount) current = { ...current, ...fromAccount };
  apply(current);
  media?.addEventListener('change', () => apply(current));
}

export async function saveSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  apply(current);
  subs.forEach((f) => f(current));
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* без localStorage настройки живут до перезагрузки */
  }
  if (sb && currentSession()) await sb.auth.updateUser({ data: { settings: current } }).catch(() => {});
}

export function useSettings(): Settings {
  const [s, setS] = useState(current);
  useEffect(() => {
    subs.add(setS);
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}
