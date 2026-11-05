export type HouseRules = {
  banCastling: boolean;
  mustCapture: boolean;
};

export const OPEN_RULES: HouseRules = { banCastling: false, mustCapture: false };

type RuleMove = {
  flags?: string;
  captured?: string;
  isCapture?: () => boolean;
  isKingsideCastle?: () => boolean;
  isQueensideCastle?: () => boolean;
};

export function filterMoves<T extends RuleMove>(moves: T[], rules: HouseRules): T[] {
  let next = moves;
  if (rules.banCastling) {
    next = next.filter(
      (m) =>
        !(
          m.isKingsideCastle?.() ||
          m.isQueensideCastle?.() ||
          m.flags === "k" ||
          m.flags === "q"
        ),
    );
  }
  if (rules.mustCapture && next.some((m) => m.isCapture?.() || Boolean(m.captured))) {
    next = next.filter((m) => m.isCapture?.() || Boolean(m.captured));
  }
  return next;
}

export function sameRules(a: HouseRules, b: HouseRules) {
  return a.banCastling === b.banCastling && a.mustCapture === b.mustCapture;
}
