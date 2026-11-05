import { pickMove, type AiMove } from "./ai";
import type { HouseRules } from "./rules";

type Request = { id: number; fen: string; depth: number; rules: HouseRules };
type Response = { id: number; move?: AiMove; error?: string };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: Response) => void;
};

scope.onmessage = (event) => {
  const { id, fen, depth, rules } = event.data;
  try {
    const move = pickMove(fen, depth, rules);
    scope.postMessage({ id, move });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : "Bot hamlesi üretilemedi" });
  }
};
