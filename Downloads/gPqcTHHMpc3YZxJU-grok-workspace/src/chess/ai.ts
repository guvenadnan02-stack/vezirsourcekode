import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { filterMoves, type HouseRules } from "./rules";

const VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const PST: Record<PieceSymbol, number[][]> = {
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  n: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  b: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  r: [
    [0, 0, 0, 5, 5, 0, 0, 0],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  k: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
};

export type AiMove = { from: Square; to: Square; promotion?: PieceSymbol };

function evalWhite(chess: Chess) {
  const board = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r]?.[c];
      if (!piece) continue;
      const table = PST[piece.type];
      const row = piece.color === "w" ? r : 7 - r;
      const bonus = table[row]?.[c] ?? 0;
      const value = VALUE[piece.type] + bonus;
      score += piece.color === "w" ? value : -value;
    }
  }
  return score;
}

function sideEval(chess: Chess) {
  const white = evalWhite(chess);
  return chess.turn() === "w" ? white : -white;
}

function moveScore(move: Move) {
  let score = 0;
  if (move.captured) score += 10 * VALUE[move.captured] - VALUE[move.piece];
  if (move.promotion === "q") score += 800;
  else if (move.promotion) score += 400;
  if (move.san.includes("#")) score += 2000;
  else if (move.san.includes("+")) score += 40;
  return score;
}

function ordered(moves: Move[], preferred?: AiMove | null) {
  return [...moves].sort((a, b) => {
    const ap = preferred && a.from === preferred.from && a.to === preferred.to && a.promotion === preferred.promotion ? 5000 : 0;
    const bp = preferred && b.from === preferred.from && b.to === preferred.to && b.promotion === preferred.promotion ? 5000 : 0;
    return bp + moveScore(b) - (ap + moveScore(a));
  });
}

export function pickMove(fen: string, depth: number, rules: HouseRules): AiMove {
  const root = new Chess(fen);
  const legal = filterMoves(root.moves({ verbose: true }) as Move[], rules);
  if (legal.length === 0) throw new Error("Hamle yok");
  const maxDepth = Math.max(1, Math.min(4, depth));
  const budget = [0, 160, 520, 1400, 2600][maxDepth] ?? 2600;
  const deadline = Date.now() + budget;
  let timedOut = false;
  let nodes = 0;
  let best: Move = legal[0]!;

  const negamax = (chess: Chess, d: number, alpha: number, beta: number, ply: number): number => {
    nodes += 1;
    if ((nodes & 1023) === 0 && Date.now() > deadline) {
      timedOut = true;
      return sideEval(chess);
    }
    if (chess.isCheckmate()) return -40000 + ply;
    if (chess.isDraw()) return 0;
    if (d === 0) return sideEval(chess);
    const moves = ordered(filterMoves(chess.moves({ verbose: true }) as Move[], rules));
    if (moves.length === 0) return chess.inCheck() ? -40000 + ply : 0;
    let bestScore = -Infinity;
    let a = alpha;
    for (const move of moves) {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      const score = -negamax(chess, d - 1, -beta, -a, ply + 1);
      chess.undo();
      if (timedOut) return bestScore === -Infinity ? score : bestScore;
      if (score > bestScore) bestScore = score;
      if (score > a) a = score;
      if (a >= beta) break;
    }
    return bestScore;
  };

  let preferred: AiMove | null = null;
  for (let d = 1; d <= maxDepth; d++) {
    timedOut = false;
    let alpha = -Infinity;
    let iterBest = best;
    let iterScore = -Infinity;
    for (const move of ordered(legal, preferred)) {
      root.move({ from: move.from, to: move.to, promotion: move.promotion });
      const score = -negamax(root, d - 1, -Infinity, -alpha, 1);
      root.undo();
      if (timedOut && iterScore === -Infinity) break;
      if (!timedOut && score > iterScore) {
        iterScore = score;
        iterBest = move;
        if (score > alpha) alpha = score;
      }
      if (timedOut) break;
    }
    if (iterScore !== -Infinity) {
      best = iterBest;
      preferred = { from: best.from, to: best.to, promotion: best.promotion };
    }
    if (timedOut) break;
  }

  return { from: best.from, to: best.to, promotion: best.promotion };
}
