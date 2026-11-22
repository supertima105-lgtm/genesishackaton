import { useEffect, useState, type ReactNode } from 'react';
import { saveSettings, useSettings, type Theme } from '../lib/settings';
import { folders, localFolders } from '../lib/shelf';
import { filesOf, localStore, store } from '../lib/storage';
import { accountsOn, changePassword, nickOf, ruError, signIn, signOut, signUp, useAccount } from '../lib/supabase';
import type { DayRecord } from '../lib/types';

/** Настройки: аккаунт (ник + пароль, дневник синхронизируется между устройствами) и оформление. */
export function SettingsPage() {
  const s = useAccount();
  return (
    <section className="mx-auto grid max-w-4xl gap-8 py-4 md:grid-cols-2">
      <h1 className="font-hand text-5xl leading-none font-bold text-blue md:col-span-2">Настройки</h1>
      {!accountsOn ? (
        <Card title="Аккаунт" tilt="-rotate-1">
          <p className="text-ink-soft">В этой сборке нет ключей Supabase — дневник хранится в этом браузере.</p>
        </Card>
      ) : s ? (
        <Signed nick={nickOf(s)} />
      ) : (
        <SignForm />
      )}
      <Looks />
    </section>
  );
}

function Card({ title, tilt, children }: { title: string; tilt: string; children: ReactNode }) {
  return (
    <div className={`${tilt} card-paper self-start px-6 pt-5 pb-7`}>
      <h2 className="font-hand text-4xl leading-none font-bold text-blue">{title}</h2>
      {children}
    </div>
  );
}

const field = 'w-full border-b border-line bg-transparent py-2 text-[17px] outline-none focus:border-ink';
const bad = 'text-sm text-rust';

function SignForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [nick, setNick] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'up' && pw !== pw2) return setMsg('Пароли не совпадают.');
    setBusy(true);
    setMsg(null);
    try {
      await (mode === 'in' ? signIn(nick, pw) : signUp(nick, pw));
    } catch (err) {
      setMsg(ruError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={mode === 'in' ? 'Вход' : 'Новый аккаунт'} tilt="-rotate-1">
      <p className="mt-2 text-sm text-ink-soft">
        С аккаунтом воспоминания хранятся в облаке: записали на компьютере — открыли на телефоне. Видите их только вы.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className="label">ник</span>
          <input required autoComplete="username" autoCapitalize="none" spellCheck={false} value={nick} onChange={(e) => setNick(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="label">пароль</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className={field}
          />
        </label>
        {mode === 'up' && (
          <label className="block">
            <span className="label">пароль ещё раз</span>
            <input type="password" required minLength={6} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} />
          </label>
        )}
        {msg && <p className={bad}>{msg}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="submit" disabled={busy} className="btn btn-solid">
            {busy ? 'секунду…' : mode === 'in' ? 'Войти' : 'Создать аккаунт'}
          </button>
          <button
            type="button"
            className="font-hand text-[19px] text-ink-soft underline decoration-dotted underline-offset-4 hover:text-ink"
            onClick={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setMsg(null);
            }}
          >
            {mode === 'in' ? 'создать аккаунт' : 'уже есть аккаунт'}
          </button>
        </div>
      </form>
      <p className="label mt-5">без входа дневник живёт только в этом браузере</p>
    </Card>
  );
}

function Signed({ nick }: { nick: string }) {
  const [local, setLocal] = useState<DayRecord[] | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  const [move, setMove] = useState<{ done: number; total: number; err?: string } | null>(null);
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void localStore.list().then(setLocal, () => setLocal([]));
    void store.list().then((l) => setMine(l.length), () => setMine(null));
  }, []);

  /** Дни из этого браузера (вместе с файлами и папками) уезжают в аккаунт; в браузере остаются копии. */
  const transfer = async () => {
    if (!local?.length) return;
    setMove({ done: 0, total: local.length });
    try {
      for (let i = 0; i < local.length; i++) {
        const day = local[i];
        for (const ref of filesOf(day)) {
          const blob = await localStore.fileBlob(ref).catch(() => null);
          if (blob) await store.putFile(ref.path, blob);
        }
        await store.save(day);
        setMove({ done: i + 1, total: local.length });
      }
      const fl = await localFolders();
      if (fl.length) await folders.adopt(fl);
      setMine((await store.list()).length);
    } catch (err) {
      setMove((m) => ({ done: m?.done ?? 0, total: local.length, err: ruError(err) }));
    }
  };

  const newPw = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await changePassword(pw);
      setPw('');
      setPwMsg({ ok: true, text: 'Пароль сменён.' });
    } catch (err) {
      setPwMsg({ ok: false, text: ruError(err) });
    }
  };

  return (
    <Card title="Аккаунт" tilt="-rotate-1">
      <p className="mt-3 font-hand text-[26px] leading-none text-ink">@{nick}</p>
      <p className="label mt-2">
        в облаке: {mine ?? '…'} {mine === null ? '' : plural(mine)} · синхронизируется на всех устройствах
      </p>

      {local && local.length > 0 && (
        <div className="mt-5 border-t border-dashed border-ink-soft/40 pt-4">
          <p className="text-sm text-ink">
            В этом браузере есть {local.length} {plural(local.length)}, записанных без входа.
          </p>
          {move && !move.err && move.done === move.total ? (
            <p className="mt-3 font-hand text-[21px] text-blue">Перенесено — они теперь в аккаунте.</p>
          ) : (
            <button type="button" disabled={Boolean(move && !move.err)} onClick={() => void transfer()} className="btn mt-3">
              {move && !move.err ? `переношу ${move.done} из ${move.total}…` : 'Перенести в аккаунт'}
            </button>
          )}
          {move?.err && <p className={`mt-2 ${bad}`}>{move.err}</p>}
        </div>
      )}

      <form onSubmit={newPw} className="mt-5 border-t border-dashed border-ink-soft/40 pt-4">
        <label className="block">
          <span className="label">новый пароль</span>
          <input type="password" required minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
        </label>
        <button type="submit" className="btn mt-3">
          Сменить пароль
        </button>
        {pwMsg && <p className={`mt-2 ${pwMsg.ok ? 'text-sm text-ink' : bad}`}>{pwMsg.text}</p>}
      </form>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={() => void signOut()}>
          Выйти
        </button>
      </div>
    </Card>
  );
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'светлая' },
  { id: 'dark', label: 'тёмная' },
  { id: 'system', label: 'как в системе' },
];

function Looks() {
  const s = useSettings();
  const pick = (on: boolean) =>
    `rounded-sm px-3 pt-1 pb-1.5 font-hand text-[20px] leading-none shadow-[0_2px_0_rgba(0,0,0,.08)] ${on ? 'bg-blue text-white' : 'bg-paper text-ink'}`;
  return (
    <Card title="Оформление" tilt="rotate-1">
      <p className="label mt-4">тема</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={pick(s.theme === t.id)} onClick={() => void saveSettings({ theme: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <Toggle on={s.bigText} onChange={(v) => void saveSettings({ bigText: v })} title="Крупный текст" hint="всё на сайте чуть больше" />
      <p className="label mt-5">{accountsOn ? 'после входа настройки тоже сохраняются в аккаунте' : 'настройки хранятся в этом браузере'}</p>
    </Card>
  );
}

function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="mt-4 flex cursor-pointer items-center gap-3">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[var(--color-blue)]" />
      <span>
        <span className="block text-ink">{title}</span>
        <span className="label">{hint}</span>
      </span>
    </label>
  );
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'дня';
  return 'дней';
}
