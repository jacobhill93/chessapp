import Link from "next/link";
import { isDrawResult, type ChessComGame } from "@/lib/chesscom";
import styles from "./GameCard.module.css";

type Outcome = "win" | "draw" | "loss";

function outcomeFor(side: ChessComGame["white"]): Outcome {
  if (side.result === "win") return "win";
  if (isDrawResult(side.result)) return "draw";
  return "loss";
}

export function GameCard({
  game,
  username,
  mistakeCount,
}: {
  game: ChessComGame;
  username: string;
  mistakeCount: number | null;
}) {
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
  const you = isWhite ? game.white : game.black;
  const opponent = isWhite ? game.black : game.white;
  const outcome = outcomeFor(you);
  const date = new Date(game.end_time * 1000).toLocaleDateString();

  return (
    <Link
      href={`/games/${game.uuid}?username=${encodeURIComponent(username)}`}
      className={`${styles.card} ${styles[outcome]}`}
    >
      <div className={styles.top}>
        <span className={styles.opponent}>
          vs {opponent.username} ({opponent.rating})
        </span>
        <span className={styles.mistakes}>
          {mistakeCount === null ? "—" : `${mistakeCount} mistake${mistakeCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className={styles.detail}>
        {date} — {game.time_class} — you played {isWhite ? "white" : "black"} ({you.rating}, {outcome})
      </div>
    </Link>
  );
}
