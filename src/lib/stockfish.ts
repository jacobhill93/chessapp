import { spawn } from "node:child_process";

export interface EngineScore {
  type: "cp" | "mate";
  /** Centipawns (or mate-in-N moves), from White's perspective regardless of side to move. */
  value: number;
}

export interface EngineEvaluation {
  bestMove: string;
  depth: number;
  score: EngineScore | null;
  pv: string[];
}

const STOCKFISH_PATH = process.env.STOCKFISH_PATH ?? "/usr/games/stockfish";
const ENGINE_TIMEOUT_MS = 30_000;

function sideToMove(fen: string): "w" | "b" {
  const turn = fen.split(" ")[1];
  return turn === "b" ? "b" : "w";
}

/**
 * Evaluates a position with a local Stockfish process over UCI.
 * Spawns and tears down one process per call; fine for interactive,
 * one-off evaluation, but batch analysis (e.g. a whole game) should reuse
 * a single long-lived process instead.
 */
export function evaluatePosition(
  fen: string,
  options: { depth?: number; movetimeMs?: number } = {},
): Promise<EngineEvaluation> {
  const goCommand = options.depth
    ? `go depth ${options.depth}`
    : `go movetime ${options.movetimeMs ?? 500}`;
  const flipSign = sideToMove(fen) === "b";

  return new Promise((resolve, reject) => {
    const engine = spawn(/* turbopackIgnore: true */ STOCKFISH_PATH);
    let buffer = "";
    let lastDepth = 0;
    let lastScore: EngineScore | null = null;
    let lastPv: string[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Stockfish timed out")));
    }, ENGINE_TIMEOUT_MS);

    function send(command: string) {
      engine.stdin.write(command + "\n");
    }

    function finish(action: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      engine.kill();
      action();
    }

    engine.on("error", (err) => finish(() => reject(err)));

    engine.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("uciok")) {
          send("isready");
        } else if (line.startsWith("readyok")) {
          send(`position fen ${fen}`);
          send(goCommand);
        } else if (line.startsWith("info depth")) {
          const depthMatch = line.match(/\bdepth (\d+)/);
          const cpMatch = line.match(/\bscore cp (-?\d+)/);
          const mateMatch = line.match(/\bscore mate (-?\d+)/);
          const pvMatch = line.match(/ pv (.+)$/);

          if (depthMatch) lastDepth = Number(depthMatch[1]);
          if (cpMatch) {
            const value = Number(cpMatch[1]);
            lastScore = { type: "cp", value: flipSign ? -value : value };
          } else if (mateMatch) {
            const value = Number(mateMatch[1]);
            lastScore = { type: "mate", value: flipSign ? -value : value };
          }
          if (pvMatch) lastPv = pvMatch[1].trim().split(" ");
        } else if (line.startsWith("bestmove")) {
          const bestMove = line.split(" ")[1];
          finish(() =>
            resolve({ bestMove, depth: lastDepth, score: lastScore, pv: lastPv }),
          );
        }
      }
    });

    send("uci");
  });
}
