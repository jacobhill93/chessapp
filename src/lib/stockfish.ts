import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface, Interface } from "node:readline";

export interface EngineScore {
  type: "cp" | "mate";
  /**
   * For "cp": centipawns from White's perspective (positive = better for White).
   * For "mate": moves until mate — always non-negative (0 = checkmate has
   * already been delivered). See `favors` for which side wins it; a
   * signed value can't represent this on its own since a "mate favors
   * Black, delivered now" and "mate favors White, delivered now" score
   * would otherwise both have to be zero.
   */
  value: number;
  /** Only present for "mate" scores: which side delivers/has delivered the mate. */
  favors?: "w" | "b";
}

export interface EngineEvaluation {
  bestMove: string;
  depth: number;
  score: EngineScore | null;
  pv: string[];
  /** Score of the engine's second-best line, only populated when evaluate() was called with multiPv >= 2 (null if not requested, or no alternative line existed — e.g. only one legal move). */
  secondBestScore: EngineScore | null;
}

const STOCKFISH_PATH = process.env.STOCKFISH_PATH ?? "/usr/games/stockfish";
const ENGINE_TIMEOUT_MS = 30_000;

function sideToMove(fen: string): "w" | "b" {
  const turn = fen.split(" ")[1];
  return turn === "b" ? "b" : "w";
}

interface PvSlot {
  depth: number;
  score: EngineScore | null;
  pv: string[];
}

interface PendingEvaluation {
  flipSign: boolean;
  resolve: (evaluation: EngineEvaluation) => void;
  reject: (err: Error) => void;
  /** Keyed by UCI's 1-indexed "multipv N" rank; slot 1 is always the primary line. */
  pvSlots: Map<number, PvSlot>;
  timeout: NodeJS.Timeout;
}

/**
 * A long-lived Stockfish process, kept open across many evaluate() calls so
 * batch analysis (e.g. every position of a game) doesn't pay process-spawn
 * overhead per position. Only one evaluate() call may be in flight at a
 * time — callers must await each before starting the next.
 */
export class StockfishSession {
  private readonly engine: ChildProcessWithoutNullStreams;
  private readonly rl: Interface;
  private readonly ready: Promise<void>;
  private pending: PendingEvaluation | null = null;
  private currentMultiPv = 1;

  constructor() {
    this.engine = spawn(/* turbopackIgnore: true */ STOCKFISH_PATH);
    this.rl = createInterface({ input: this.engine.stdout });

    this.ready = new Promise((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      this.engine.once("error", onError);

      const onStartupLine = (line: string) => {
        if (line.startsWith("uciok")) {
          this.send("isready");
        } else if (line.startsWith("readyok")) {
          this.engine.off("error", onError);
          this.rl.off("line", onStartupLine);
          this.rl.on("line", (l) => this.handleEvaluationLine(l));
          resolve();
        }
      };

      this.rl.on("line", onStartupLine);
      this.send("uci");
    });

    this.engine.on("error", (err) => this.failPending(err));
    this.engine.on("exit", () =>
      this.failPending(new Error("Stockfish process exited unexpectedly")),
    );
  }

  private send(command: string) {
    this.engine.stdin.write(command + "\n");
  }

  private failPending(err: Error) {
    if (!this.pending) return;
    clearTimeout(this.pending.timeout);
    this.pending.reject(err);
    this.pending = null;
  }

  private handleEvaluationLine(line: string) {
    const p = this.pending;
    if (!p) return;

    if (line.startsWith("info depth")) {
      const depthMatch = line.match(/\bdepth (\d+)/);
      const multipvMatch = line.match(/\bmultipv (\d+)/);
      const cpMatch = line.match(/\bscore cp (-?\d+)/);
      const mateMatch = line.match(/\bscore mate (-?\d+)/);
      const pvMatch = line.match(/ pv (.+)$/);

      const pvIndex = multipvMatch ? Number(multipvMatch[1]) : 1;
      const slot: PvSlot = p.pvSlots.get(pvIndex) ?? { depth: 0, score: null, pv: [] };

      if (depthMatch) slot.depth = Number(depthMatch[1]);
      if (cpMatch) {
        const value = Number(cpMatch[1]);
        slot.score = { type: "cp", value: p.flipSign ? -value : value };
      } else if (mateMatch) {
        // Raw value is relative to the side to move: positive means that
        // side delivers the mate, negative means they get mated. At
        // exactly 0 (checkmate already delivered) the engine reports an
        // unsigned 0, which always means the side to move has just been
        // mated (there's no legal move otherwise) — handle that case
        // explicitly rather than relying on the sign of zero.
        const rawValue = Number(mateMatch[1]);
        const sideToMove = p.flipSign ? "b" : "w";
        const otherSide = sideToMove === "w" ? "b" : "w";
        const favors = rawValue === 0 ? otherSide : rawValue > 0 ? sideToMove : otherSide;
        slot.score = { type: "mate", value: Math.abs(rawValue), favors };
      }
      if (pvMatch) slot.pv = pvMatch[1].trim().split(" ");

      p.pvSlots.set(pvIndex, slot);
    } else if (line.startsWith("bestmove")) {
      const bestMove = line.split(" ")[1];
      clearTimeout(p.timeout);
      this.pending = null;
      const primary = p.pvSlots.get(1);
      const secondary = p.pvSlots.get(2);
      p.resolve({
        bestMove,
        depth: primary?.depth ?? 0,
        score: primary?.score ?? null,
        pv: primary?.pv ?? [],
        secondBestScore: secondary?.score ?? null,
      });
    }
  }

  async evaluate(
    fen: string,
    options: { depth?: number; movetimeMs?: number; multiPv?: number } = {},
  ): Promise<EngineEvaluation> {
    await this.ready;

    if (this.pending) {
      throw new Error(
        "StockfishSession.evaluate called while a previous evaluation is still in flight",
      );
    }

    const multiPv = options.multiPv ?? 1;
    if (multiPv !== this.currentMultiPv) {
      this.send(`setoption name MultiPV value ${multiPv}`);
      this.currentMultiPv = multiPv;
    }

    const goCommand = options.depth
      ? `go depth ${options.depth}`
      : `go movetime ${options.movetimeMs ?? 500}`;
    const flipSign = sideToMove(fen) === "b";

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error("Stockfish timed out"));
      }, ENGINE_TIMEOUT_MS);

      this.pending = {
        flipSign,
        resolve,
        reject,
        pvSlots: new Map(),
        timeout,
      };
      this.send(`position fen ${fen}`);
      this.send(goCommand);
    });
  }

  quit() {
    this.failPending(new Error("StockfishSession was quit while an evaluation was in flight"));
    this.send("quit");
    this.rl.close();
    this.engine.kill();
  }
}

/** Evaluates a single position, spawning and tearing down its own engine process. */
export async function evaluatePosition(
  fen: string,
  options: { depth?: number; movetimeMs?: number } = {},
): Promise<EngineEvaluation> {
  const session = new StockfishSession();
  try {
    return await session.evaluate(fen, options);
  } finally {
    session.quit();
  }
}
