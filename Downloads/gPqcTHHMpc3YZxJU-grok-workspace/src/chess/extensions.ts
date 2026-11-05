import { useEffect, useState } from "react";
import type { HouseRules } from "./rules";

export type ExtensionFlag = "coords" | "sound" | "clock" | "lastmove" | "material" | "banCastling" | "mustCapture";

export type Extension = {
  id: string;
  name: string;
  description: string;
  flag?: ExtensionFlag;
  custom?: boolean;
};

export type MoveContext = {
  san: string;
  fen: string;
  note: (text: string) => void;
};

type MoveHook = (ctx: MoveContext) => void;

const ENABLED = "vezir.extensions.v1";
const CUSTOM = "vezir.custom-extensions.v1";

export const BUILTINS: Extension[] = [
  { id: "coords", name: "Koordinatlar", description: "Dosya ve sıra etiketlerini gösterir.", flag: "coords" },
  { id: "sound", name: "Hamle sesi", description: "Her hamlede kısa bir ton.", flag: "sound" },
  { id: "lastmove", name: "Son hamle izi", description: "Son oynanan kareleri vurgular.", flag: "lastmove" },
  { id: "material", name: "Materyal sayacı", description: "Alınan taşları skor kağıdında gösterir.", flag: "material" },
  { id: "clock", name: "Satranç saati", description: "Bot ve aynı ekran partilerinde 5+0 saat.", flag: "clock" },
  { id: "ban-castle", name: "Rok yasağı", description: "Şah ve kale rok yapamaz.", flag: "banCastling" },
  { id: "must-capture", name: "Zorunlu alma", description: "Alacak taş varsa almak zorundasın.", flag: "mustCapture" },
];

const DEFAULTS: Record<string, boolean> = {
  coords: true,
  sound: true,
  lastmove: true,
  material: true,
  clock: false,
  "ban-castle": false,
  "must-capture": false,
};

const hooks = new Map<string, MoveHook>();
const listeners = new Set<() => void>();

function readEnabled(): Record<string, boolean> {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(ENABLED);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeEnabled(map: Record<string, boolean>) {
  localStorage.setItem(ENABLED, JSON.stringify(map));
  listeners.forEach((fn) => fn());
}

export function customExtensions(): Extension[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM);
    const list = raw ? (JSON.parse(raw) as Extension[]) : [];
    return Array.isArray(list) ? list.filter((item) => item && item.id && item.name) : [];
  } catch {
    return [];
  }
}

function writeCustom(list: Extension[]) {
  localStorage.setItem(CUSTOM, JSON.stringify(list));
  listeners.forEach((fn) => fn());
}

export function listExtensions(): Extension[] {
  return [...BUILTINS, ...customExtensions()];
}

export function isEnabled(id: string) {
  return Boolean(readEnabled()[id]);
}

export function setEnabled(id: string, on: boolean) {
  const map = readEnabled();
  map[id] = on;
  writeEnabled(map);
}

export function activeRules(): HouseRules {
  return {
    banCastling: isEnabled("ban-castle"),
    mustCapture: isEnabled("must-capture"),
  };
}

export function addCustomExtension(name: string, description: string, hook?: MoveHook) {
  const clean = name.trim().slice(0, 42);
  if (!clean) return null;
  const id = `ozel-${Date.now().toString(36)}`;
  const ext: Extension = {
    id,
    name: clean,
    description: description.trim().slice(0, 140) || "Oyuncu tanımlı modül.",
    custom: true,
  };
  writeCustom([...customExtensions(), ext]);
  setEnabled(id, true);
  if (hook) hooks.set(id, hook);
  else {
    hooks.set(id, (ctx) => ctx.note(`${clean}: ${ctx.san}`));
  }
  return ext;
}

export function removeCustomExtension(id: string) {
  writeCustom(customExtensions().filter((item) => item.id !== id));
  hooks.delete(id);
  const map = readEnabled();
  delete map[id];
  writeEnabled(map);
}

export function runMoveHooks(ctx: MoveContext) {
  for (const ext of customExtensions()) {
    if (!isEnabled(ext.id)) continue;
    const hook = hooks.get(ext.id);
    if (!hook) continue;
    try {
      hook(ctx);
    } catch {
      ctx.note(`${ext.name} çalışırken durdu.`);
    }
  }
}

export function useExtensionRevision() {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const fn = () => setRev((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return rev;
}

export type SatrancApi = {
  ekle: (mod: { id?: string; ad: string; aciklama?: string; hamle?: (ctx: MoveContext) => void }) => Extension | null;
  moduller: () => Array<{ id: string; ad: string; acik: boolean }>;
  ac: (id: string) => void;
  kapat: (id: string) => void;
};

export function installSatrancApi() {
  const api: SatrancApi = {
    ekle(mod) {
      return addCustomExtension(mod.ad, mod.aciklama ?? "", mod.hamle);
    },
    moduller() {
      return listExtensions().map((ext) => ({ id: ext.id, ad: ext.name, acik: isEnabled(ext.id) }));
    },
    ac(id) {
      setEnabled(id, true);
    },
    kapat(id) {
      setEnabled(id, false);
    },
  };
  window.Satranc = api;
}

declare global {
  interface Window {
    Satranc?: SatrancApi;
  }
}
