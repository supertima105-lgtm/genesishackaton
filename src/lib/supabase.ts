import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

/**
 * Аккаунты дневника. Ключ — publishable (он и рассчитан на браузер), а чужие дни закрыты RLS-политиками
 * (supabase/schema.sql). Без ключей или без входа дневник живёт в IndexedDB этого браузера, как раньше.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const sb: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const accountsOn = Boolean(sb);

let session: Session | null = null;

/** Читает сохранённый вход до первого рендера: от него зависит, откуда брать дни. */
export async function loadSession(): Promise<Session | null> {
  if (!sb) return null;
  try {
    session = (await sb.auth.getSession()).data.session;
  } catch {
    session = null;
  }
  return session;
}

export const currentSession = () => session;

const RU: [RegExp, string][] = [
  [/invalid login credentials/i, 'Неверный ник или пароль.'],
  [/email not confirmed|confirmation/i, 'Аккаунт создан, но в Supabase включено подтверждение почты — его нужно выключить (Authentication → Email → Confirm email).'],
  [/user already registered/i, 'Такой ник уже занят — выберите другой или войдите.'],
  [/same.*password|different from the old/i, 'Новый пароль совпадает со старым.'],
  [/password should be at least/i, 'Пароль слишком короткий — нужно хотя бы 6 символов.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'Похоже, в адресе почты опечатка.'],
  [/rate limit|too many/i, 'Слишком много попыток — подождите минуту.'],
  [/failed to fetch|network/i, 'Нет связи с сервером — проверьте интернет.'],
];
export const ruError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return RU.find(([r]) => r.test(m))?.[1] ?? m;
};

/** После входа или выхода меняется весь архив — проще всего начать страницу заново. */
const restart = () => {
  location.hash = '#/';
  location.reload();
};

/**
 * Вход по нику: Supabase Auth знает только почту, поэтому ник превращается во внутренний адрес
 * <ник>@atmosfera-diary.app (кириллица — в hex). Писем туда не уходит: подтверждение почты в проекте выключено.
 */
const DOMAIN = 'atmosfera-diary.app';
export const cleanNick = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');
export function nickError(nick: string) {
  if (nick.length < 3) return 'Ник — хотя бы 3 символа.';
  if (nick.length > 24) return 'Ник — не длиннее 24 символов.';
  if (!/^[\p{L}\p{N}_.-]+$/u.test(nick)) return 'В нике можно буквы, цифры, «_», «.» и «-».';
  return null;
}
function nickEmail(nick: string) {
  const local = /^[a-z0-9_.-]+$/.test(nick)
    ? nick
    : 'u' + [...new TextEncoder().encode(nick)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${local}@${DOMAIN}`;
}
/** Ник для показа: из профиля, иначе из адреса. */
export const nickOf = (s: Session | null) => (s?.user.user_metadata?.nick as string | undefined) ?? s?.user.email?.split('@')[0] ?? '';

export async function signIn(nickRaw: string, password: string) {
  if (!sb) throw new Error('Supabase не настроен');
  const nick = cleanNick(nickRaw);
  const { error } = await sb.auth.signInWithPassword({ email: nickEmail(nick), password });
  if (error) throw error;
  restart();
}

export async function signUp(nickRaw: string, password: string) {
  if (!sb) throw new Error('Supabase не настроен');
  const nick = cleanNick(nickRaw);
  const bad = nickError(nick);
  if (bad) throw new Error(bad);
  const { data, error } = await sb.auth.signUp({ email: nickEmail(nick), password, options: { data: { nick } } });
  if (error) throw error;
  if (data.user && !data.user.identities?.length) throw new Error('User already registered');
  if (!data.session) throw new Error('Email not confirmed');
  restart();
}

export async function changePassword(password: string) {
  if (!sb) throw new Error('Supabase не настроен');
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (!sb) return;
  await sb.auth.signOut().catch(() => {});
  restart();
}

/** Кто вошёл — для шапки и страницы аккаунта. */
export function useAccount() {
  const [s, setS] = useState<Session | null>(session);
  useEffect(() => {
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((_e, next) => {
      session = next;
      setS(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return s;
}
