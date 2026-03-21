import { Choice } from "@/models/Match";

type PayoffResult = {
  player1Points: number;
  player2Points: number;
};

export function calculatePayoff(p1Choice: Choice, p2Choice: Choice): PayoffResult {
  if (p1Choice === "cooperate" && p2Choice === "cooperate") return { player1Points: 3, player2Points: 3 };
  if (p1Choice === "cooperate" && p2Choice === "betray")    return { player1Points: 0, player2Points: 5 };
  if (p1Choice === "betray"    && p2Choice === "cooperate") return { player1Points: 5, player2Points: 0 };
  return { player1Points: 1, player2Points: 1 }; // both betray
}
