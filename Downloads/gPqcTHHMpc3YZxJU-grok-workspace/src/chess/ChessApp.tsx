import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import {
  Bot,
  Copy,
  Dices,
  Link2,
  LogOut,
  Plus,
  RotateCcw,
  ShieldAlert,
  Swords,
  Undo2,
  Users,
} from "lucide-react";
import {
  loadSession,
  loginAccount,
  logout,
  playAnon,
  readStats,
  recordResult,
  registerAccount,
  type Session,
  type Stats,
} from "./accounts";
import { pickMove, type AiMove } from "./ai";
import { Board, hintsFrom } from "./Board";
import {
  BUILTINS,
  activeRules,
  addCustomExtension,
  customExtensions,
  installSatrancApi,
  isEnabled,
  listExtensions,
  removeCustomExtension,
  runMoveHooks,
  setEnabled,
  useExtensionRevision,
} from "./extensions";
import { describeOutcome, legalMovesFrom, replaySans, type Outcome, type Side } from "./logic";
import { ChessPiece, type ThemeName } from "./pieces";
import { type HouseRules } from "./rules";
import {
  claimSeat,
  createRoom,
  pushRoomMove,
  readRoomParam,
  resignRoom,
  resetRoom,
  setRoomParam,
  subscribeRoom,
  tabToken,
} from "./rooms";
import { playTone, unlockAudio } from "./sound";

type Screen = "welcome" | "auth" | "lobby" | "bot" | "friend" | "search" | "game";
type Mode = "bot" | "ranked" | "hotseat" | "room";

type Live = {
  mode: Mode;
  sans: string[];
  seat: Side | "both" | "spectate";
  orientation: Side;
  depth: number;
  whiteName: string;
  blackName: string;
  rules: HouseRules;
  useClock: boolean;
  roomId?: string;
  ready: boolean;
  locked: boolean;
  result: Outcome | null;
};

const DEPTHS = [
  { depth: 1 as const, name: "Kolay", blurb: "Derinlik 1. Tek hamlelik bakış." },
  { depth: 2 as const, name: "Orta", blurb: "Derinlik 2. Kısa taktikleri görür." },
  { depth: 3 as const, name: "Zor", blurb: "Derinlik 3. Hesaplı ve sıkı oynar." },
  { depth: 4 as const, name: "Ultra Zor", blurb: "Derinlik 4. En derin arama." },
];

const POOL: Array<[string, number]> = [
  ["Ece Arslan", 1260],
  ["Kerem Usta", 1490],
  ["Nisan Yıldız", 1380],
  ["Mert Kaplan", 1710],
  ["Defne Solmaz", 1620],
  ["Baran Efe", 1880],
  ["Leyla Tan", 1540],
  ["Okan Poyraz", 2030],
];

const SALON = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

function loadTheme(): ThemeName {
  if (typeof window === "undefined") return "classic";
  return localStorage.getItem("vezir.theme") === "modern" ? "modern" : "classic";
}

function clockText(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function missing(chess: Chess, color: Side) {
  const have = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.color === color && piece.type !== "k") have[piece.type] += 1;
    }
  }
  const start = { q: 1, r: 2, b: 2, n: 2, p: 8 };
  const lost: Array<"q" | "r" | "b" | "n" | "p"> = [];
  (Object.keys(start) as Array<keyof typeof start>).forEach((type) => {
    for (let i = 0; i < start[type] - have[type]; i++) lost.push(type);
  });
  return lost;
}

export function ChessApp() {
  const [booted, setBooted] = useState(false);
  useEffect(() => setBooted(true), []);
  if (!booted) return <Splash />;
  return <Experience />;
}

function Splash() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <p className="font-display text-5xl font-medium italic text-gold">Vezir</p>
        <p className="mt-2 text-muted">Masa hazırlanıyor</p>
      </div>
    </main>
  );
}

function Experience() {
  const rev = useExtensionRevision();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [stats, setStats] = useState<Stats>(() => readStats(loadSession()));
  const [screen, setScreen] = useState<Screen>(() => (loadSession() ? "lobby" : "welcome"));
  const [theme, setTheme] = useState<ThemeName>(() => loadTheme());
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]["depth"]>(2);
  const [color, setColor] = useState<Side | "random">("w");
  const [roomCode, setRoomCode] = useState("");
  const [roomError, setRoomError] = useState("");
  const [scan, setScan] = useState("Havuz açılıyor");
  const [live, setLive] = useState<Live | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [clock, setClock] = useState<{ w: number; b: number } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [modName, setModName] = useState("");
  const [modText, setModText] = useState("");
  const [copied, setCopied] = useState("");
  const [boardEpoch, setBoardEpoch] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const reqRef = useRef(0);
  const cheatLatch = useRef(false);
  const scored = useRef(false);
  const joined = useRef(false);
  const turnRef = useRef<Side>("w");
  const flagRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const heardRef = useRef(0);

  useEffect(() => {
    installSatrancApi();
    try {
      workerRef.current = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
    } catch {
      workerRef.current = null;
    }
    return () => workerRef.current?.terminate();
  }, []);

  const chess = useMemo(() => replaySans(live?.sans ?? []) ?? new Chess(), [live?.sans]);
  const fen = chess.fen();
  const history = chess.history({ verbose: true });
  const last = history.length ? { from: history[history.length - 1]!.from, to: history[history.length - 1]!.to } : null;
  turnRef.current = chess.turn();

  useEffect(() => {
    if (!session || joined.current) return;
    const id = readRoomParam();
    if (!id) return;
    joined.current = true;
    const claimed = claimSeat(id, session.display);
    if (!claimed.room || claimed.role === "missing") {
      setRoomError("Bu oda bu tarayıcıda yok.");
      setScreen("friend");
      return;
    }
    openLiveFromRoom(claimed.room, claimed.role);
  }, [session]);

  useEffect(() => {
    if (screen !== "game" || live?.mode !== "room" || !live.roomId) return;
    const id = live.roomId;
    return subscribeRoom(id, (room) => {
      if (room.whiteToken !== tabToken() && room.blackToken !== tabToken() && live.seat !== "spectate") return;
      setLive((current) => {
        if (!current || current.roomId !== id) return current;
        const result = room.resultText && room.winner ? { text: room.resultText, winner: room.winner } : null;
        const sansSame = current.sans.join(" ") === room.sans.join(" ");
        const name = room.blackName ?? "Rakip bekleniyor";
        if (sansSame && current.blackName === name && current.ready === (room.status !== "waiting") && (current.result?.text ?? null) === (result?.text ?? null)) {
          return current;
        }
        return {
          ...current,
          sans: room.sans,
          whiteName: room.whiteName,
          blackName: name,
          ready: room.status !== "waiting",
          rules: room.rules,
          result,
        };
      });
    });
  }, [screen, live?.mode, live?.roomId, live?.seat]);

  useEffect(() => {
    if (screen !== "game" || !live || live.locked || live.result) return;
    const position = replaySans(live.sans);
    if (!position) return;
    const outcome = describeOutcome(position, live.rules);
    if (outcome) {
      setLive((current) => (current && !current.result ? { ...current, result: outcome } : current));
      if (isEnabled("sound")) playTone("end");
      return;
    }
    const botTurn =
      (live.mode === "bot" || live.mode === "ranked") &&
      live.seat !== "both" &&
      live.seat !== "spectate" &&
      position.turn() !== live.seat;
    if (!botTurn) return;
    const id = ++reqRef.current;
    const snapshot = position.fen();
    const rules = live.rules;
    const searchDepth = live.depth;
    let cancel = false;
    setThinking(true);
    const apply = (move: AiMove | null) => {
      if (cancel || !move) {
        if (!cancel) setThinking(false);
        return;
      }
      setThinking(false);
      setLive((current) => {
        if (!current || current.locked || current.result) return current;
        const next = replaySans(current.sans);
        if (!next) return current;
        try {
          const played = next.move({ from: move.from, to: move.to, promotion: move.promotion });
          return { ...current, sans: [...current.sans, played.san] };
        } catch {
          return current;
        }
      });
    };
    const worker = workerRef.current;
    if (!worker) {
      void pickMoveSafe(snapshot, searchDepth, rules).then(apply);
      return () => {
        cancel = true;
      };
    }
    const onMessage = (event: MessageEvent<{ id: number; move?: AiMove }>) => {
      if (event.data?.id !== id) return;
      worker.removeEventListener("message", onMessage);
      if (event.data.move) apply(event.data.move);
      else void pickMoveSafe(snapshot, searchDepth, rules).then(apply);
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, fen: snapshot, depth: searchDepth, rules });
    return () => {
      cancel = true;
      worker.removeEventListener("message", onMessage);
      setThinking(false);
    };
  }, [screen, live?.sans, live?.locked, live?.result, live?.mode, live?.seat, live?.depth, live?.rules.banCastling, live?.rules.mustCapture]);

  useEffect(() => {
    if (!live) return;
    const previous = heardRef.current;
    heardRef.current = live.sans.length;
    if (live.sans.length === 0 || live.sans.length <= previous) return;
    const position = replaySans(live.sans);
    const move = position?.history({ verbose: true }).at(-1);
    if (!position || !move) return;
    if (isEnabled("sound")) playTone(position.inCheck() ? "check" : move.isCapture() ? "capture" : "move");
    runMoveHooks({
      san: move.san,
      fen: position.fen(),
      note: (text) => setNotes((items) => [text, ...items].slice(0, 12)),
    });
  }, [live]);

  useEffect(() => {
    if (!live?.result || !session || scored.current) return;
    if (live.mode === "hotseat" || live.seat === "spectate" || live.seat === "both") return;
    scored.current = true;
    const outcome = live.result.winner === "draw" ? "draw" : live.result.winner === live.seat ? "win" : "loss";
    recordResult(session, outcome);
    setStats(readStats(session));
  }, [live?.result, live?.mode, live?.seat, session]);

  useEffect(() => {
    if (screen !== "game" || !live?.useClock || live.result || live.locked || (live.mode === "room" && !live.ready)) return;
    flagRef.current = false;
    const timer = window.setInterval(() => {
      const side = turnRef.current;
      setClock((current) => {
        if (!current) return current;
        const left = current[side] - 0.2;
        if (left <= 0) {
          if (!flagRef.current) {
            flagRef.current = true;
            const winner = side === "w" ? "b" : "w";
            setLive((game) =>
              game && !game.result
                ? { ...game, result: { text: side === "w" ? "Süre bitti — Siyah kazandı" : "Süre bitti — Beyaz kazandı", winner } }
                : game,
            );
          }
          return { ...current, [side]: 0 };
        }
        return { ...current, [side]: left };
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [screen, live?.useClock, live?.result, live?.locked, live?.ready, live?.mode, live?.sans]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [live?.sans.length]);

  useEffect(() => {
    if (screen !== "search" || !session) return;
    let index = 0;
    const names = POOL.map(([name]) => name);
    const tick = window.setInterval(() => {
      index += 1;
      setScan(names[index % names.length] ?? "Aranıyor");
    }, 420);
    const wait = window.setTimeout(() => {
      const [name, base] = POOL[Math.floor(Math.random() * POOL.length)] ?? POOL[0]!;
      const rating = base + Math.floor(Math.random() * 90 - 40);
      const foundDepth = rating < 1300 ? 1 : rating < 1550 ? 2 : rating < 1850 ? 3 : 4;
      beginGame({
        mode: "ranked",
        seat: Math.random() < 0.5 ? "w" : "b",
        depth: foundDepth,
        opponent: name,
        rating,
      });
    }, 2800);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(wait);
    };
  }, [screen, session]);

  function chooseTheme(next: ThemeName) {
    setTheme(next);
    localStorage.setItem("vezir.theme", next);
  }

  function freshCounters() {
    cheatLatch.current = false;
    scored.current = false;
    flagRef.current = false;
    heardRef.current = 0;
    setBanner(null);
    setSelected(null);
    setPromo(null);
    setNotes([]);
    setThinking(false);
    setClock({ w: 300, b: 300 });
    setBoardEpoch((n) => n + 1);
  }

  function beginGame(opts: { mode: Mode; seat: Side | "both"; depth: number; opponent: string; rating?: number; roomId?: string; ready?: boolean; rules?: HouseRules; whiteName?: string; blackName?: string }) {
    if (!session) return;
    freshCounters();
    const seat = opts.seat;
    const mine = session.display;
    const whiteName = opts.whiteName ?? (seat === "b" ? opts.opponent : mine);
    const blackName = opts.blackName ?? (seat === "w" ? opts.opponent : seat === "both" ? "Siyah" : mine);
    setLive({
      mode: opts.mode,
      sans: [],
      seat,
      orientation: seat === "b" ? "b" : "w",
      depth: opts.depth,
      whiteName: seat === "both" ? "Beyaz" : whiteName,
      blackName: seat === "both" ? "Siyah" : blackName,
      rules: opts.rules ?? activeRules(),
      useClock: opts.mode === "room" ? false : isEnabled("clock"),
      roomId: opts.roomId,
      ready: opts.ready ?? true,
      locked: false,
      result: null,
    });
    setScreen("game");
  }

  function openLiveFromRoom(room: NonNullable<ReturnType<typeof claimSeat>["room"]>, role: "white" | "black" | "spectate") {
    freshCounters();
    heardRef.current = room.sans.length;
    const seat = role === "white" ? "w" : role === "black" ? "b" : "spectate";
    setLive({
      mode: "room",
      sans: room.sans,
      seat,
      orientation: seat === "b" ? "b" : "w",
      depth: 2,
      whiteName: room.whiteName,
      blackName: room.blackName ?? "Rakip bekleniyor",
      rules: room.rules,
      useClock: false,
      roomId: room.id,
      ready: room.status !== "waiting",
      locked: false,
      result: room.resultText && room.winner ? { text: room.resultText, winner: room.winner } : null,
    });
    setRoomParam(room.id);
    setScreen("game");
  }

  function lockCheat() {
    if (cheatLatch.current) return;
    cheatLatch.current = true;
    setBanner("Hile Tespit Edildi! Hamle Geçersiz.");
    setSelected(null);
    setPromo(null);
    setLive((current) => (current ? { ...current, locked: true } : current));
    setBoardEpoch((n) => n + 1);
  }

  function onSquare(square: Square) {
    if (!live || live.locked || live.result) return;
    if (live.mode === "room" && !live.ready) return;
    if (live.seat === "spectate") return;
    const position = replaySans(live.sans);
    if (!position) return;
    const turn = position.turn();
    const myTurn = live.seat === "both" || live.seat === turn;
    if (!myTurn || thinking) {
      if (position.get(square)) lockCheat();
      return;
    }
    if (selected) {
      const targets = legalMovesFrom(position, selected, live.rules).filter((move) => move.to === square);
      if (targets.length > 0) {
        if (targets.some((move) => move.promotion)) {
          setPromo({ from: selected, to: square });
          return;
        }
        commit(targets[0]!.from, targets[0]!.to, targets[0]!.promotion);
        return;
      }
    }
    const piece = position.get(square);
    if (piece && piece.color === turn) setSelected(square);
    else setSelected(null);
  }

  function commit(from: Square, to: Square, promotion?: PieceSymbol) {
    if (!live || live.locked || live.result) return;
    if (live.mode === "room" && live.roomId) {
      const result = pushRoomMove(live.roomId, from, to, promotion);
      if (!result.ok) {
        if (result.reason === "turn") lockCheat();
        return;
      }
      const room = result.room;
      setLive((current) =>
        current
          ? {
              ...current,
              sans: room.sans,
              ready: room.status !== "waiting",
              blackName: room.blackName ?? current.blackName,
              result: room.resultText && room.winner ? { text: room.resultText, winner: room.winner } : current.result,
            }
          : current,
      );
    } else {
      const position = replaySans(live.sans);
      if (!position) return;
      const allowed = legalMovesFrom(position, from, live.rules).filter((move) => move.to === to);
      const match = allowed.find((move) => (move.promotion ?? null) === (promotion ?? null)) ?? allowed.find((move) => !promotion);
      if (!match) return;
      try {
        const played = position.move({ from: match.from, to: match.to, promotion: match.promotion });
        setLive((current) => (current ? { ...current, sans: [...current.sans, played.san] } : current));
      } catch {
        return;
      }
    }
    setSelected(null);
    setPromo(null);
  }

  function undo() {
    if (!live || live.locked || live.result || thinking || live.mode === "room") return;
    const drop = live.mode === "hotseat" ? 1 : 2;
    if (live.sans.length < drop) return;
    heardRef.current = live.sans.length - drop;
    setLive((current) => (current ? { ...current, sans: current.sans.slice(0, -drop) } : current));
    setSelected(null);
  }

  function resign() {
    if (!live || live.result || live.locked || live.seat === "spectate") return;
    if (live.mode === "room" && live.roomId) {
      const room = resignRoom(live.roomId);
      if (room?.resultText && room.winner) setLive((current) => (current ? { ...current, result: { text: room.resultText!, winner: room.winner! } } : current));
      return;
    }
    const side: Side = live.seat === "both" ? chess.turn() : live.seat;
    setLive((current) =>
      current
        ? { ...current, result: { text: side === "w" ? "Beyaz terk etti" : "Siyah terk etti", winner: side === "w" ? "b" : "w" } }
        : current,
    );
  }

  function rematch() {
    if (!live) return;
    if (live.mode === "room" && live.roomId) {
      const room = resetRoom(live.roomId);
      freshCounters();
      setLive((current) =>
        current
          ? { ...current, sans: room?.sans ?? [], result: null, locked: false, ready: room ? room.status !== "waiting" : current.ready }
          : current,
      );
      return;
    }
    freshCounters();
    setLive((current) => (current ? { ...current, sans: [], result: null, locked: false } : current));
  }

  function leave() {
    setRoomParam(null);
    setLive(null);
    setScreen("lobby");
    setThinking(false);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("Kopyalanamadı");
    }
  }

  const myTurn = Boolean(live && !live.result && !live.locked && !thinking && (live.seat === "both" || live.seat === chess.turn()) && (live.mode !== "room" || live.ready));
  const moves = selected && live && myTurn ? legalMovesFrom(chess, selected, live.rules) : [];
  const showCoords = isEnabled("coords");
  const showLast = isEnabled("lastmove");
  const showMaterial = isEnabled("material");
  void rev;

  return (
    <div className="min-h-dvh" onPointerDown={unlockAudio}>
      {banner ? (
        <div className="fixed inset-x-4 top-4 z-40 mx-auto max-w-md rounded-2xl border border-danger bg-surface px-4 py-3 text-fg shadow-lg" role="alert">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
            <div>
              <p className="font-medium">{banner}</p>
              <button type="button" className="mt-2 text-sm text-gold" onClick={rematch}>
                Yeni parti
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {screen === "welcome" ? (
        <Welcome onAuth={() => { setFormError(""); setScreen("auth"); }} onAnon={() => { const next = playAnon(); setSession(next); setStats(readStats(next)); setScreen("lobby"); }} />
      ) : null}

      {screen === "auth" ? (
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
          <button type="button" className="mb-6 text-left text-sm text-muted" onClick={() => setScreen("welcome")}>Geri</button>
          <p className="font-display text-4xl font-medium italic text-gold">Vezir</p>
          <h1 className="mt-2 text-xl">{authMode === "login" ? "Giriş yap" : "Hesap aç"}</h1>
          <p className="mt-1 text-sm text-muted">Hesap yalnızca bu tarayıcıda durur. Şifre düz metin olarak saklanmaz.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className={tabClass(authMode === "login")} onClick={() => { setAuthMode("login"); setFormError(""); }}>Giriş yap</button>
            <button type="button" className={tabClass(authMode === "register")} onClick={() => { setAuthMode("register"); setFormError(""); }}>Hesap aç</button>
          </div>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setFormError("");
              const task = authMode === "login" ? loginAccount(username, password) : registerAccount(username, password, confirm);
              void task.then((result) => {
                setBusy(false);
                if (!result.ok) { setFormError(result.error); return; }
                setSession(result.session);
                setStats(readStats(result.session));
                setPassword("");
                setConfirm("");
                setScreen("lobby");
              });
            }}
          >
            <label className="block text-sm text-muted">
              Kullanıcı adı
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" spellCheck={false} className={fieldClass} />
            </label>
            <label className="block text-sm text-muted">
              Şifre
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} className={fieldClass} />
            </label>
            {authMode === "register" ? (
              <label className="block text-sm text-muted">
                Şifre tekrar
                <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" autoComplete="new-password" className={fieldClass} />
              </label>
            ) : null}
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
            <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-gold px-4 py-3 font-medium text-ink">
              {busy ? "Bekleyin" : authMode === "login" ? "Giriş yap" : "Hesabı oluştur"}
            </button>
          </form>
        </main>
      ) : null}

      {screen === "lobby" && session ? (
        <Shell session={session} theme={theme} onTheme={chooseTheme} onExtensions={() => setExtensionsOpen(true)} onLogout={() => { logout(); setSession(null); setScreen("welcome"); }}>
          <p className="text-sm text-muted">Hoş geldin</p>
          <h1 className="font-display text-4xl font-medium italic">{session.display}</h1>
          <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
            <Stat label="Parti" value={stats.played} />
            <Stat label="Galibiyet" value={stats.wins} />
            <Stat label="Berabere" value={stats.draws} />
            <Stat label="Mağlubiyet" value={stats.losses} />
          </dl>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <ModeCard icon={<Bot className="size-5 text-gold" />} title="Bota karşı" text="Dört derinlik: kolaydan ultra zora." onClick={() => setScreen("bot")} />
            <ModeCard icon={<Link2 className="size-5 text-gold" />} title="Arkadaşınla" text="Oda kodu, aynı tarayıcıda iki sekme." onClick={() => { setRoomError(""); setScreen("friend"); }} />
            <ModeCard icon={<Dices className="size-5 text-gold" />} title="Rastgele rakip" text="Havuzda kısa bir arama, sonra masa." onClick={() => setScreen("search")} />
          </div>
        </Shell>
      ) : null}

      {screen === "bot" && session ? (
        <Shell session={session} theme={theme} onTheme={chooseTheme} onExtensions={() => setExtensionsOpen(true)} onLogout={() => { logout(); setSession(null); setScreen("welcome"); }}>
          <button type="button" className="text-sm text-muted" onClick={() => setScreen("lobby")}>Lobi</button>
          <h1 className="mt-2 font-display text-4xl font-medium italic">Bota karşı</h1>
          <div className="mt-5 grid gap-2">
            {DEPTHS.map((item) => (
              <button key={item.depth} type="button" onClick={() => setDepth(item.depth)} className={choiceClass(depth === item.depth)}>
                <span className="font-medium">{item.name}</span>
                <span className="block text-sm text-muted">{item.blurb}</span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-sm text-muted">Taş rengin</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([["w", "Beyaz"], ["b", "Siyah"], ["random", "Rastgele"]] as const).map(([id, label]) => (
              <button key={id} type="button" className={choiceClass(color === id)} onClick={() => setColor(id)}>{label}</button>
            ))}
          </div>
          <button
            type="button"
            className="mt-5 min-h-11 rounded-xl bg-gold px-4 py-3 font-medium text-ink"
            onClick={() => beginGame({ mode: "bot", seat: color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color, depth, opponent: `Vezir · ${DEPTHS.find((item) => item.depth === depth)?.name ?? "Bot"}` })}
          >
            Partiyi başlat
          </button>
        </Shell>
      ) : null}

      {screen === "friend" && session ? (
        <Shell session={session} theme={theme} onTheme={chooseTheme} onExtensions={() => setExtensionsOpen(true)} onLogout={() => { logout(); setSession(null); setScreen("welcome"); }}>
          <button type="button" className="text-sm text-muted" onClick={() => setScreen("lobby")}>Lobi</button>
          <h1 className="mt-2 font-display text-4xl font-medium italic">Arkadaşınla</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">Oda bu tarayıcının hafızasında durur. Kodu ikinci bir sekmeye yapıştır; iki taraf aynı tahtayı paylaşır.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="min-h-24 rounded-2xl border border-line bg-surface p-4 text-left"
              onClick={() => {
                const room = createRoom(session.display, activeRules());
                openLiveFromRoom(room, "white");
              }}
            >
              <Plus className="size-5 text-gold" />
              <span className="mt-3 block font-medium">Oda kur</span>
              <span className="mt-1 block text-sm text-muted">Beş haneli kod ve bağlantı üret.</span>
            </button>
            <button type="button" className="min-h-24 rounded-2xl border border-line bg-surface p-4 text-left" onClick={() => beginGame({ mode: "hotseat", seat: "both", depth: 1, opponent: "Siyah" })}>
              <Users className="size-5 text-gold" />
              <span className="mt-3 block font-medium">Aynı ekranda</span>
              <span className="mt-1 block text-sm text-muted">Sırayla, tek cihazda.</span>
            </button>
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const id = roomCode.replace(/\D/g, "").slice(0, 5);
              const claimed = claimSeat(id, session.display);
              if (!claimed.room || claimed.role === "missing") { setRoomError("Oda bulunamadı."); return; }
              setRoomError("");
              openLiveFromRoom(claimed.room, claimed.role);
            }}
          >
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} inputMode="numeric" placeholder="Oda kodu" aria-label="Oda kodu" className={fieldClass} />
            <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-gold px-4 font-medium text-ink">Katıl</button>
          </form>
          {roomError ? <p className="mt-2 text-sm text-danger">{roomError}</p> : null}
        </Shell>
      ) : null}

      {screen === "search" && session ? (
        <main className="grid min-h-dvh place-items-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-gold">
              <span className="pulse-dot size-3 rounded-full bg-gold" />
            </div>
            <h1 className="mt-4 font-display text-3xl font-medium italic">Rakip aranıyor</h1>
            <p className="mt-2 text-muted">{scan}</p>
            <button type="button" className="mt-6 text-sm text-muted" onClick={() => setScreen("lobby")}>Aramayı bırak</button>
          </div>
        </main>
      ) : null}

      {screen === "game" && live && session ? (
        <main className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-6 lg:py-5">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-sm text-muted" onClick={leave}>Lobi</button>
              <p className="text-sm text-gold">{statusText(live, chess, thinking)}</p>
              <div className="flex gap-2">
                <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => setLive((current) => current ? { ...current, orientation: current.orientation === "w" ? "b" : "w" } : current)}>Çevir</button>
                <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => setExtensionsOpen(true)}>Özellik ekle</button>
              </div>
            </div>
            {promo ? (
              <div className="mb-3 flex items-center justify-center gap-2">
                <span className="text-sm text-muted">Terfi</span>
                {(["q", "r", "b", "n"] as const).map((type) => (
                  <button key={type} type="button" className="grid size-12 place-items-center rounded-lg border border-line bg-elevated" onClick={() => commit(promo.from, promo.to, type)} aria-label={`Terfi ${type}`}>
                    <ChessPiece theme={theme} type={type} color={chess.turn()} />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="board-wrap mx-auto">
              <Board
                key={boardEpoch}
                fen={fen}
                orientation={live.orientation}
                theme={theme}
                selected={selected}
                hints={hintsFrom(moves)}
                last={last}
                inCheck={chess.inCheck()}
                showCoords={showCoords}
                showLast={showLast}
                onSquare={onSquare}
                onTamper={lockCheat}
              />
            </div>
          </section>
          <aside className="flex flex-col gap-3">
            <SeatRow live={live} chess={chess} clock={clock} theme={theme} showMaterial={showMaterial} />
            <div className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Hamleler</h2>
                <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm text-gold" onClick={() => {
                  const sheet = replaySans(live.sans) ?? new Chess();
                  sheet.setHeader("Event", "Vezir");
                  sheet.setHeader("White", live.whiteName);
                  sheet.setHeader("Black", live.blackName);
                  void copyText(sheet.pgn(), "PGN");
                }}>
                  <Copy className="size-4" /> {copied === "PGN" ? "Kopyalandı" : "PGN"}
                </button>
              </div>
              <div ref={logRef} className="mt-2 max-h-64 overflow-auto text-sm">
                {live.sans.length === 0 ? <p className="text-muted">Henüz hamle yok.</p> : null}
                <ol>
                  {Array.from({ length: Math.ceil(live.sans.length / 2) }, (_, index) => (
                    <li key={index} className="grid grid-cols-[2rem_1fr_1fr] gap-2 border-b border-line py-1">
                      <span className="text-muted">{index + 1}.</span>
                      <span>{live.sans[index * 2]}</span>
                      <span>{live.sans[index * 2 + 1] ?? ""}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {notes.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
                </ul>
              ) : null}
            </div>
            {live.mode === "room" && live.roomId ? (
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Oda</p>
                <p className="font-display text-3xl font-medium text-gold">{live.roomId}</p>
                <p className="text-sm text-muted">Aynı tarayıcıda ikinci sekmeyi aç.</p>
                <button type="button" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-gold" onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("room", live.roomId ?? "");
                  void copyText(url.toString(), "link");
                }}>
                  <Link2 className="size-4" /> {copied === "link" ? "Kopyalandı" : "Bağlantıyı kopyala"}
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3" onClick={undo} disabled={live.mode === "room" || Boolean(live.result) || live.locked}>
                <Undo2 className="size-4" /> Geri al
              </button>
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3" onClick={resign} disabled={Boolean(live.result) || live.locked || live.seat === "spectate"}>
                <Swords className="size-4" /> Teslim ol
              </button>
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-3 font-medium text-ink" onClick={rematch}>
                <RotateCcw className="size-4" /> Yeni parti
              </button>
            </div>
            <p className="text-xs text-muted">Tahta mühürlü. Sıra sende değilken taş oynatmak veya konsoldan taşı değiştirmek partiyi kilitler.</p>
          </aside>
        </main>
      ) : null}

      {extensionsOpen ? (
        <ExtensionModal
          modName={modName}
          modText={modText}
          onName={setModName}
          onText={setModText}
          onClose={() => setExtensionsOpen(false)}
          onAdd={() => {
            const added = addCustomExtension(modName, modText);
            if (added) { setModName(""); setModText(""); }
          }}
        />
      ) : null}
    </div>
  );
}

const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 py-3 text-fg outline-none focus:border-gold";

function tabClass(active: boolean) {
  return active ? "min-h-11 rounded-xl bg-gold px-3 py-2 font-medium text-ink" : "min-h-11 rounded-xl border border-line px-3 py-2 text-muted";
}

function choiceClass(active: boolean) {
  return active ? "rounded-xl border border-gold bg-elevated px-3 py-3 text-left" : "rounded-xl border border-line bg-surface px-3 py-3 text-left";
}

function statusText(live: Live, chess: Chess, thinking: boolean) {
  if (live.locked) return "Parti kilitli";
  if (live.result) return live.result.text;
  if (live.mode === "room" && !live.ready) return "Rakip bekleniyor";
  if (thinking) return "Rakip düşünüyor";
  if (chess.inCheck()) return chess.turn() === "w" ? "Şah — Beyaz oynar" : "Şah — Siyah oynar";
  return chess.turn() === "w" ? "Beyaz oynar" : "Siyah oynar";
}

async function pickMoveSafe(fen: string, depth: number, rules: HouseRules) {
  try {
    return pickMove(fen, depth, rules);
  } catch {
    return null;
  }
}

function Welcome({ onAuth, onAnon }: { onAuth: () => void; onAnon: () => void }) {
  const chess = new Chess(SALON);
  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-2 lg:px-8">
      <div>
        <p className="text-sm uppercase tracking-widest text-gold">Gece masası</p>
        <h1 className="mt-2 font-display text-6xl font-medium italic leading-none text-fg">Vezir</h1>
        <p className="mt-4 max-w-md text-muted">Karanlık bir kulüp masası. Bota, aynı ekrandaki arkadaşa ya da bu tarayıcıda açtığın odaya karşı oyna.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="min-h-11 rounded-xl bg-gold px-5 py-3 font-medium text-ink" onClick={onAuth}>Giriş yap / Hesap aç</button>
          <button type="button" className="min-h-11 rounded-xl border border-line px-5 py-3" onClick={onAnon}>Anonim olarak oyna</button>
        </div>
      </div>
      <div className="theme-classic board-frame mx-auto w-full max-w-md p-3" aria-hidden="true">
        <div className="grid grid-cols-8 overflow-hidden rounded-md">
          {chess.board().map((row, r) =>
            row.map((piece, c) => (
              <div key={`${r}-${c}`} className={(r + c) % 2 === 1 ? "sq sq-light" : "sq sq-dark"}>
                {piece ? <ChessPiece theme="classic" type={piece.type} color={piece.color} /> : null}
              </div>
            )),
          )}
        </div>
      </div>
    </main>
  );
}

function Shell({
  children,
  session,
  theme,
  onTheme,
  onExtensions,
  onLogout,
}: {
  children: ReactNode;
  session: Session;
  theme: ThemeName;
  onTheme: (theme: ThemeName) => void;
  onExtensions: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-4 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-2xl font-medium italic text-gold">Vezir</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={choiceClass(theme === "classic")} onClick={() => onTheme("classic")}>Klasik</button>
          <button type="button" className={choiceClass(theme === "modern")} onClick={() => onTheme("modern")}>Minimal</button>
          <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3" onClick={onExtensions}>
            <Plus className="size-4" /> Özellik ekle
          </button>
          <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3" onClick={onLogout} aria-label={`${session.display} çıkış`}>
            <LogOut className="size-4" /> Çıkış
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-2 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-2xl">{value}</dd>
    </div>
  );
}

function ModeCard({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-36 rounded-2xl border border-line bg-surface p-4 text-left hover:border-gold">
      {icon}
      <span className="mt-4 block font-display text-2xl font-medium">{title}</span>
      <span className="mt-1 block text-sm text-muted">{text}</span>
    </button>
  );
}

function SeatRow({
  live,
  chess,
  clock,
  theme,
  showMaterial,
}: {
  live: Live;
  chess: Chess;
  clock: { w: number; b: number } | null;
  theme: ThemeName;
  showMaterial: boolean;
}) {
  const bottom = live.orientation;
  const top: Side = bottom === "w" ? "b" : "w";
  return (
    <>
      <PlayerCard {...seatView(live, chess, clock, theme, showMaterial, top)} />
      <PlayerCard {...seatView(live, chess, clock, theme, showMaterial, bottom)} />
    </>
  );
}

function seatView(live: Live, chess: Chess, clock: { w: number; b: number } | null, theme: ThemeName, showMaterial: boolean, side: Side) {
  const captured: Side = side === "w" ? "b" : "w";
  return {
    name: side === "w" ? live.whiteName : live.blackName,
    time: live.useClock && clock ? clockText(clock[side]) : null,
    active: chess.turn() === side && !live.result,
    low: Boolean(clock && clock[side] < 30),
    pieces: showMaterial ? missing(chess, captured) : [],
    theme,
    side: captured,
  };
}

function PlayerCard({
  name,
  time,
  active,
  low,
  pieces,
  theme,
  side,
}: {
  name: string;
  time: string | null;
  active: boolean;
  low: boolean;
  pieces: Array<"q" | "r" | "b" | "n" | "p">;
  theme: ThemeName;
  side: Side;
}) {
  return (
    <div className={active ? "rounded-2xl border border-gold bg-surface p-3" : "rounded-2xl border border-line bg-surface p-3"}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-medium">{name}</p>
        {time ? <span className={low ? "font-medium text-danger" : "text-muted"}>{time}</span> : null}
      </div>
      {pieces.length > 0 ? (
        <div className={`theme-${theme} mt-1 flex flex-wrap`}>
          {pieces.map((type, index) => (
            <span key={`${type}-${index}`} className="block size-5">
              <ChessPiece theme={theme} type={type} color={side} />
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExtensionModal({
  modName,
  modText,
  onName,
  onText,
  onClose,
  onAdd,
}: {
  modName: string;
  modText: string;
  onName: (value: string) => void;
  onText: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  const modules = listExtensions();
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-bg/80 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ext-title">
      <div className="modal-panel w-full max-w-lg overflow-auto rounded-3xl border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gold">Modül</p>
            <h2 id="ext-title" className="font-display text-3xl font-medium italic">Özellik ekle</h2>
          </div>
          <button type="button" className="min-h-11 px-2 text-muted" onClick={onClose}>Kapat</button>
        </div>
        <p className="mt-2 text-sm text-muted">Kurallar parti başında kilitlenir. Görsel modüller anında değişir. Konsoldan da ekleyebilirsin:</p>
        <pre className="mt-3 overflow-auto rounded-xl bg-bg p-3 text-xs text-muted">{`Satranc.ekle({
  ad: "Not düş",
  aciklama: "Hamleyi günlüğe yazar",
  hamle(ctx) { ctx.note(ctx.san) }
})`}</pre>
        <ul className="mt-4 space-y-2">
          {modules.map((mod) => (
            <li key={mod.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <div>
                <p className="font-medium">{mod.name}</p>
                <p className="text-sm text-muted">{mod.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {mod.custom ? (
                  <button type="button" className="text-sm text-danger" onClick={() => removeCustomExtension(mod.id)}>Sil</button>
                ) : null}
                <button type="button" className={isEnabled(mod.id) ? "min-h-11 rounded-lg bg-gold px-3 text-sm font-medium text-ink" : "min-h-11 rounded-lg border border-line px-3 text-sm"} onClick={() => setEnabled(mod.id, !isEnabled(mod.id))}>
                  {isEnabled(mod.id) ? "Açık" : "Kapalı"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <input value={modName} onChange={(event) => onName(event.target.value)} placeholder="Yeni modül adı" aria-label="Yeni modül adı" className={fieldClass} />
          <input value={modText} onChange={(event) => onText(event.target.value)} placeholder="Kısa açıklama" aria-label="Modül açıklaması" className={fieldClass} />
          <button type="submit" className="min-h-11 rounded-xl border border-gold px-4 font-medium text-gold">Modülü kaydet</button>
        </form>
        <p className="mt-3 text-xs text-muted">Hazır kurallar: {BUILTINS.filter((item) => item.flag === "banCastling" || item.flag === "mustCapture").map((item) => item.name).join(", ")}. Saat bot ve aynı ekran partilerinde 5 dakikadır.</p>
      </div>
    </div>
  );
}
