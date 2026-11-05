import type { Side } from "./logic";

export type ThemeName = "classic" | "modern";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

const CLASSIC: Record<PieceType, string[]> = {
  p: [
    "M20 6.2c2.8 0 5 2.25 5 5.05 0 1.9-1.05 3.55-2.6 4.4 2.7.75 4.7 2.7 5.75 5.45 1.15 3.05 1.65 6.7 1.65 9.2H10.2c0-2.5.5-6.15 1.65-9.2 1.05-2.75 3.05-4.7 5.75-5.45-1.55-.85-2.6-2.5-2.6-4.4 0-2.8 2.2-5.05 5-5.05zM9 32.4h22v3H9z",
  ],
  r: ["M8 7.5h6.2V11h3.4V7.5h4.8V11H26V7.5h6v6.4h-2.3V33h2.3v3.2H8V33h2.3V13.9H8V7.5z"],
  n: [
    "M12 34.2c.4-7.6 1.5-11.6 4-14.6 1.5-1.8 1.7-3.6.6-5.4-.7-1.2-1.5-2-1.6-3.4-.2-1.7 1-2.9 2.6-3.4 1.5-.5 2.5.4 3.3 1.5.5-2.2 2.6-3.8 5-3.3 1.7.4 2.5 1.7 2.5 3.2.1 1.6-.6 2.5-.2 3.8.6 1.8 2.6 2.6 4 4.6 1.7 2.5 2.3 5.6 2 8.4-.2 2-1.5 3.2-3.2 3.4 1.5 1.2 3.2 3.2 3.8 5.2v4H12z",
  ],
  b: [
    "M20 4c2.5 0 4.4 2 4.4 4.35 0 1.4-.7 2.65-1.75 3.4 4.05 1.6 7.05 5.3 7.75 10.15.5 3.1.7 6.3.7 8.6H8.9c0-2.3.2-5.5.7-8.6.7-4.85 3.7-8.55 7.75-10.15A4.4 4.4 0 0 1 15.6 8.35C15.6 6 17.5 4 20 4zm-1 3.15h2v6.7h-2v-6.7zM9.6 32.5h20.8v3H9.6z",
  ],
  q: [
    "M8 33.2 12.4 17.2 16.5 25.6 20 10.2 23.5 25.6 27.6 17.2 32 33.2z",
    "M12.4 17.2m-2.15 0a2.15 2.15 0 1 0 4.3 0a2.15 2.15 0 1 0-4.3 0",
    "M20 10.2m-2.15 0a2.15 2.15 0 1 0 4.3 0a2.15 2.15 0 1 0-4.3 0",
    "M27.6 17.2m-2.15 0a2.15 2.15 0 1 0 4.3 0a2.15 2.15 0 1 0-4.3 0",
    "M8.4 33h23.2v3H8.4z",
  ],
  k: [
    "M17.8 3h4.4v3.5h3.5v4.4h-3.5V14h-4.4v-3.1h-3.5V6.5h3.5V3z",
    "M12.6 16.8h14.8l3.3 15.4H9.3l3.3-15.4z",
    "M8.4 32.4h23.2v3.2H8.4z",
  ],
};

const MODERN: Record<PieceType, string[]> = {
  p: ["M16.3 11.2a3.7 3.7 0 1 1 7.4 0a3.7 3.7 0 1 1-7.4 0", "M20 15.1V29", "M13.2 32.2h13.6"],
  r: ["M11 33V16.5H9.5V9h5.2v3.1h3.2V9h3.2v3.1H24.3V9h5.2v7.5H28V33", "M10 33h20"],
  n: ["M13 33c.6-6.8 1.8-10.4 4.6-13.2 1.8-1.8 2-3.8.8-5.6-.8-1.3.1-3 2-3.1 2.1 0 3.2 1.6 4.8 1.8 2.2.2 5.2 1.8 6.2 4.8 1.1 3.4-.4 6-2.8 7.2 1.8 1.6 3.6 4.2 4.2 7.1"],
  b: ["M20 6.5 28.5 32.5h-17z", "M20 12.5v8.5"],
  q: ["M8 32.5 13.2 15.2 20 26.2 26.8 15.2 32 32.5", "M11 34.2h18", "M13.2 15.2m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0", "M20 10.2m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0", "M26.8 15.2m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0"],
  k: ["M20 4.8v7.2", "M16.2 8.4h7.6", "M12.5 17.6h15L30 33.2H10z"],
};

export function pathsFor(theme: ThemeName, type: string): string[] {
  const table = theme === "modern" ? MODERN : CLASSIC;
  return table[(type as PieceType) in table ? (type as PieceType) : "p"];
}

export function pieceSeal(theme: ThemeName, piece: string): string {
  if (!piece) return "empty";
  const paths = pathsFor(theme, piece[1] ?? "p");
  let n = 0;
  for (const d of paths) n += d.length;
  return `${piece}:${paths.length}:${n}`;
}

export function ChessPiece({
  theme,
  type,
  color,
}: {
  theme: ThemeName;
  type: string;
  color: Side | string;
}) {
  const paths = pathsFor(theme, type);
  return (
    <svg
      viewBox="0 0 40 40"
      data-glyph={`${color}${type}`}
      className={color === "w" ? "piece piece-w" : "piece piece-b"}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} fillRule="evenodd" />
      ))}
    </svg>
  );
}
