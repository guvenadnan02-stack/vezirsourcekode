import { Chess, type Move, type Square } from "chess.js";
import { filterMoves, type HouseRules } from "./rules";

export type Side = "w" | "b";
export type Winner = Side | "draw";

export type Outcome = {
  text: string;
  winner: Winner;
};

const MATE_WHITE = "Şah mat — Beyaz kazandı";
const MATE_BLACK = "Şah mat — Siyah kazandı";

export function replaySans(sans: string[]): Chess | null {
  const chess = new Chess();
  for (const san of sans) {
    try {
      const moved = chess.move(san);
      if (!moved) return null;
    } catch {
      return null;
    }
  }
  return chess;
}

export function describeOutcome(chess: Chess, rules: HouseRules): Outcome | null {
  const legal = filterMoves(chess.moves({ verbose: true }) as Move[], rules);
  if (legal.length === 0) {
    if (chess.inCheck()) {
      return chess.turn() === "w"
        ? { text: MATE_BLACK, winner: "b" }
        : { text: MATE_WHITE, winner: "w" };
    }
    return { text: "Pat — berabere", winner: "draw" };
  }
  if (chess.isInsufficientMaterial()) {
    return { text: "Yetersiz materyal — berabere", winner: "draw" };
  }
  if (chess.isThreefoldRepetition()) {
    return { text: "Üç kez tekrar — berabere", winner: "draw" };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { text: "50 hamle kuralı — berabere", winner: "draw" };
  }
  if (chess.isDraw()) {
    return { text: "Berabere", winner: "draw" };
  }
  return null;
}

export function legalMovesFrom(chess: Chess, square: Square, rules: HouseRules): Move[] {
  return filterMoves(chess.moves({ square, verbose: true }) as Move[], rules);
}

export function kingSquare(chess: Chess, color: Side): Square | null {
  const found = chess.findPiece({ type: "k", color });
  return found[0] ?? null;
}

export function squareAt(row: number, col: number, orientation: Side): Square {
  const r = orientation === "w" ? row : 7 - row;
  const c = orientation === "w" ? col : 7 - col;
  return `${"abcdefgh"[c]}${8 - r}` as Square;
}

export function fileRank(orientation: Side) {
  const files = orientation === "w" ? [..."abcdefgh"] : [..."hgfedcba"];
  const ranks = orientation === "w" ? ["8", "7", "6", "5", "4", "3", "2", "1"] : ["1", "2", "3", "4", "5", "6", "7", "8"];
  return { files, ranks };
}
