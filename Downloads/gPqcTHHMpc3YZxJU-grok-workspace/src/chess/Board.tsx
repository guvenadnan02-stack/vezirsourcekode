import { useEffect, useRef } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { fileRank, kingSquare, squareAt, type Side } from "./logic";
import { ChessPiece, pieceSeal, type ThemeName } from "./pieces";

export function expectedBoardSeal(fen: string, orientation: Side, theme: ThemeName) {
  const chess = new Chess(fen);
  const board = chess.board();
  let seal = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = squareAt(row, col, orientation);
      const r = orientation === "w" ? row : 7 - row;
      const c = orientation === "w" ? col : 7 - col;
      const piece = board[r]?.[c];
      const id = piece ? `${piece.color}${piece.type}` : "";
      seal += `${sq}=${pieceSeal(theme, id)};`;
    }
  }
  return seal;
}

function readBoardSeal(root: HTMLElement) {
  let seal = "";
  root.querySelectorAll<HTMLElement>("[data-sq]").forEach((sq) => {
    const name = sq.getAttribute("data-sq") ?? "";
    const piece = sq.getAttribute("data-piece") ?? "";
    const paths = [...sq.querySelectorAll("path")];
    const length = paths.reduce((sum, path) => sum + (path.getAttribute("d")?.length ?? 0), 0);
    const glyph = piece ? `${piece}:${paths.length}:${length}` : "empty";
    seal += `${name}=${glyph};`;
  });
  return seal;
}

export function Board({
  fen,
  orientation,
  theme,
  selected,
  hints,
  last,
  inCheck,
  showCoords,
  showLast,
  onSquare,
  onTamper,
}: {
  fen: string;
  orientation: Side;
  theme: ThemeName;
  selected: Square | null;
  hints: Map<string, "move" | "capture">;
  last: { from: string; to: string } | null;
  inCheck: boolean;
  showCoords: boolean;
  showLast: boolean;
  onSquare: (square: Square) => void;
  onTamper: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const expectedRef = useRef("");
  const tamperRef = useRef(onTamper);
  tamperRef.current = onTamper;
  const chess = new Chess(fen);
  const board = chess.board();
  const checkSq = inCheck ? kingSquare(chess, chess.turn()) : null;
  const { files, ranks } = fileRank(orientation);
  expectedRef.current = expectedBoardSeal(fen, orientation, theme);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (readBoardSeal(el) !== expectedRef.current) tamperRef.current();
      });
    });
    observer.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fen, orientation, theme]);

  return (
    <div className={`theme-${theme} board-frame p-3 sm:p-4`}>
      <div className="flex gap-1.5 sm:gap-2">
        {showCoords ? (
          <div className="flex flex-col justify-around py-0.5 text-center text-xs text-muted" aria-hidden="true">
            {ranks.map((rank) => (
              <span key={rank}>{rank}</span>
            ))}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div ref={ref} className="grid grid-cols-8 overflow-hidden rounded-md" role="grid" aria-label="Satranç tahtası">
            {Array.from({ length: 8 }, (_, row) =>
              Array.from({ length: 8 }, (_, col) => {
                const sq = squareAt(row, col, orientation);
                const r = orientation === "w" ? row : 7 - row;
                const c = orientation === "w" ? col : 7 - col;
                const piece = board[r]?.[c];
                const id = piece ? `${piece.color}${piece.type}` : "";
                const light = (r + c) % 2 === 1;
                const hint = hints.get(sq);
                const marked = showLast && last && (last.from === sq || last.to === sq);
                return (
                  <button
                    key={sq}
                    type="button"
                    role="gridcell"
                    data-sq={sq}
                    data-piece={id}
                    aria-label={piece ? `${piece.color === "w" ? "Beyaz" : "Siyah"} ${piece.type} ${sq}` : sq}
                    onClick={() => onSquare(sq)}
                    className={[
                      "sq",
                      light ? "sq-light" : "sq-dark",
                      selected === sq ? "sq-selected" : "",
                      marked ? "sq-last" : "",
                      checkSq === sq ? "sq-check" : "",
                      hint === "capture" ? "sq-capture" : hint === "move" ? "sq-legal" : "",
                    ].join(" ")}
                  >
                    {piece ? <ChessPiece theme={theme} type={piece.type} color={piece.color} /> : null}
                  </button>
                );
              }),
            )}
          </div>
          {showCoords ? (
            <div className="mt-1 grid grid-cols-8 text-center text-xs text-muted" aria-hidden="true">
              {files.map((file) => (
                <span key={file}>{file}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function hintsFrom(moves: Move[]) {
  const hints = new Map<string, "move" | "capture">();
  for (const move of moves) hints.set(move.to, move.isCapture() ? "capture" : "move");
  return hints;
}
