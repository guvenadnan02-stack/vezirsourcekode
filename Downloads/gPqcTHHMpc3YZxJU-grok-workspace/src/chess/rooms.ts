import type { Move, PieceSymbol, Square } from "chess.js";
import { describeOutcome, replaySans, type Winner } from "./logic";
import { filterMoves, type HouseRules, OPEN_RULES } from "./rules";

export type RoomState = {
  id: string;
  sans: string[];
  whiteName: string;
  blackName: string | null;
  whiteToken: string;
  blackToken: string | null;
  status: "waiting" | "live" | "over";
  rules: HouseRules;
  resultText: string | null;
  winner: Winner | null;
  updated: number;
};

const TOKEN = "vezir.tab";

function key(id: string) {
  return `vezir.room.${id}`;
}

export function tabToken() {
  let token = sessionStorage.getItem(TOKEN);
  if (!token) {
    token = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(TOKEN, token);
  }
  return token;
}

function read(id: string): RoomState | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const room = JSON.parse(raw) as RoomState;
    if (!room || typeof room.id !== "string" || !Array.isArray(room.sans)) return null;
    if (!replaySans(room.sans)) return null;
    return room;
  } catch {
    return null;
  }
}

function publish(room: RoomState) {
  room.updated = Date.now();
  localStorage.setItem(key(room.id), JSON.stringify(room));
  try {
    const channel = new BroadcastChannel(`vezir-room-${room.id}`);
    channel.postMessage({ updated: room.updated });
    channel.close();
  } catch {
    /* BroadcastChannel is optional; storage events and polling still sync tabs. */
  }
}

function freshId() {
  for (let n = 0; n < 20; n++) {
    const id = String(Math.floor(10000 + Math.random() * 90000));
    if (!localStorage.getItem(key(id))) return id;
  }
  return String(Date.now()).slice(-5);
}

export function createRoom(name: string, rules: HouseRules = OPEN_RULES): RoomState {
  const room: RoomState = {
    id: freshId(),
    sans: [],
    whiteName: name,
    blackName: null,
    whiteToken: tabToken(),
    blackToken: null,
    status: "waiting",
    rules,
    resultText: null,
    winner: null,
    updated: Date.now(),
  };
  publish(room);
  return room;
}

export function loadRoom(id: string) {
  return read(id.replace(/\D/g, "").slice(0, 5));
}

export function claimSeat(id: string, name: string): { room: RoomState | null; role: "white" | "black" | "spectate" | "missing" } {
  const room = read(id);
  if (!room) return { room: null, role: "missing" };
  const token = tabToken();
  if (room.whiteToken === token) return { room, role: "white" };
  if (room.blackToken === token) return { room, role: "black" };
  if (!room.blackToken) {
    room.blackToken = token;
    room.blackName = name;
    room.status = room.resultText ? "over" : "live";
    publish(room);
    return { room, role: "black" };
  }
  return { room, role: "spectate" };
}

function seatOf(room: RoomState, token: string): "w" | "b" | null {
  if (room.whiteToken === token) return "w";
  if (room.blackToken === token) return "b";
  return null;
}

function finishIfNeeded(room: RoomState) {
  const chess = replaySans(room.sans);
  if (!chess) return;
  const outcome = describeOutcome(chess, room.rules);
  if (outcome) {
    room.status = "over";
    room.resultText = outcome.text;
    room.winner = outcome.winner;
  }
}

export function pushRoomMove(
  id: string,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
): { ok: true; room: RoomState } | { ok: false; reason: "missing" | "wait" | "turn" | "illegal" | "over" } {
  const room = read(id);
  if (!room) return { ok: false, reason: "missing" };
  if (room.status === "over" || room.resultText) return { ok: false, reason: "over" };
  if (room.status !== "live" || !room.blackToken) return { ok: false, reason: "wait" };
  const chess = replaySans(room.sans);
  if (!chess) return { ok: false, reason: "illegal" };
  const seat = seatOf(room, tabToken());
  if (seat !== chess.turn()) return { ok: false, reason: "turn" };
  const allowed = filterMoves(chess.moves({ verbose: true }) as Move[], room.rules);
  const candidates = allowed.filter((m) => m.from === from && m.to === to);
  if (candidates.length === 0) return { ok: false, reason: "illegal" };
  const chosen =
    candidates.find((m) => (m.promotion ?? null) === (promotion ?? m.promotion ?? null)) ??
    candidates.find((m) => !m.promotion) ??
    candidates.find((m) => m.promotion === (promotion ?? "q"));
  if (!chosen) return { ok: false, reason: "illegal" };
  try {
    const moved = chess.move({ from, to, promotion: chosen.promotion });
    room.sans.push(moved.san);
  } catch {
    return { ok: false, reason: "illegal" };
  }
  finishIfNeeded(room);
  publish(room);
  return { ok: true, room };
}

export function resignRoom(id: string) {
  const room = read(id);
  if (!room || room.status === "over") return null;
  const seat = seatOf(room, tabToken());
  if (!seat) return null;
  room.status = "over";
  room.winner = seat === "w" ? "b" : "w";
  room.resultText = seat === "w" ? "Beyaz terk etti" : "Siyah terk etti";
  publish(room);
  return room;
}

export function resetRoom(id: string) {
  const room = read(id);
  if (!room) return null;
  const seat = seatOf(room, tabToken());
  if (!seat) return null;
  room.sans = [];
  room.resultText = null;
  room.winner = null;
  room.status = room.blackToken ? "live" : "waiting";
  publish(room);
  return room;
}

export function subscribeRoom(id: string, cb: (room: RoomState) => void) {
  const emit = () => {
    const room = read(id);
    if (room) cb(room);
  };
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(`vezir-room-${id}`);
  } catch {
    channel = null;
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === key(id)) emit();
  };
  window.addEventListener("storage", onStorage);
  channel?.addEventListener("message", emit);
  emit();
  const timer = window.setInterval(emit, 1200);
  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.removeEventListener("message", emit);
    channel?.close();
    window.clearInterval(timer);
  };
}

export function setRoomParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("room", id);
  else url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
}

export function readRoomParam() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("room")?.replace(/\D/g, "").slice(0, 5) ?? "";
}
