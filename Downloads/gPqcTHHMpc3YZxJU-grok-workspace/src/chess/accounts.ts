export type Stats = { played: number; wins: number; losses: number; draws: number };

export type Session = {
  kind: "user" | "anon";
  username: string;
  display: string;
};

type Account = {
  username: string;
  passHash: string;
  created: number;
  stats: Stats;
};

const ACCOUNTS = "vezir.accounts.v1";
const SESSION = "vezir.session.v1";
const ANON_STATS = "vezir.anon-stats.v1";

export const EMPTY_STATS: Stats = { played: 0, wins: 0, losses: 0, draws: 0 };

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function digest(username: string, password: string) {
  const payload = `vezir.v1|${username}|${password}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = (h * 33) ^ payload.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function accounts(): Account[] {
  const list = readJson<Account[]>(ACCOUNTS, []);
  return Array.isArray(list) ? list : [];
}

export function loadSession(): Session | null {
  const session = readJson<Session | null>(SESSION, null);
  if (!session || (session.kind !== "user" && session.kind !== "anon") || !session.display) {
    return null;
  }
  return session;
}

export function saveSession(session: Session | null) {
  if (!session) localStorage.removeItem(SESSION);
  else writeJson(SESSION, session);
}

export async function registerAccount(usernameRaw: string, password: string, confirm: string) {
  const username = usernameRaw.trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return { ok: false as const, error: "Kullanıcı adı 3-16 karakter, harf, rakam veya alt çizgi olmalı." };
  }
  if (password.length < 4) return { ok: false as const, error: "Şifre en az 4 karakter olmalı." };
  if (password !== confirm) return { ok: false as const, error: "Şifreler eşleşmiyor." };
  const list = accounts();
  if (list.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false as const, error: "Bu kullanıcı adı alınmış." };
  }
  const account: Account = {
    username,
    passHash: await digest(username.toLowerCase(), password),
    created: Date.now(),
    stats: { ...EMPTY_STATS },
  };
  list.push(account);
  writeJson(ACCOUNTS, list);
  const session: Session = { kind: "user", username, display: username };
  saveSession(session);
  return { ok: true as const, session };
}

export async function loginAccount(usernameRaw: string, password: string) {
  const username = usernameRaw.trim();
  const account = accounts().find((a) => a.username.toLowerCase() === username.toLowerCase());
  if (!account) return { ok: false as const, error: "Hesap bulunamadı." };
  const hash = await digest(account.username.toLowerCase(), password);
  if (hash !== account.passHash) return { ok: false as const, error: "Şifre hatalı." };
  const session: Session = { kind: "user", username: account.username, display: account.username };
  saveSession(session);
  return { ok: true as const, session };
}

export function playAnon(): Session {
  const n = Math.floor(1000 + Math.random() * 9000);
  const session: Session = { kind: "anon", username: `anon-${n}`, display: `Anonim ${n}` };
  saveSession(session);
  return session;
}

export function logout() {
  saveSession(null);
}

export function readStats(session: Session | null): Stats {
  if (!session) return { ...EMPTY_STATS };
  if (session.kind === "user") {
    const account = accounts().find((a) => a.username === session.username);
    return account ? { ...account.stats } : { ...EMPTY_STATS };
  }
  const map = readJson<Record<string, Stats>>(ANON_STATS, {});
  return map[session.username] ? { ...map[session.username] } : { ...EMPTY_STATS };
}

export function recordResult(session: Session, result: "win" | "loss" | "draw") {
  const patch = (stats: Stats): Stats => ({
    played: stats.played + 1,
    wins: stats.wins + (result === "win" ? 1 : 0),
    losses: stats.losses + (result === "loss" ? 1 : 0),
    draws: stats.draws + (result === "draw" ? 1 : 0),
  });
  if (session.kind === "user") {
    const list = accounts();
    const account = list.find((a) => a.username === session.username);
    if (!account) return;
    account.stats = patch(account.stats);
    writeJson(ACCOUNTS, list);
    return;
  }
  const map = readJson<Record<string, Stats>>(ANON_STATS, {});
  map[session.username] = patch(map[session.username] ?? { ...EMPTY_STATS });
  writeJson(ANON_STATS, map);
}
