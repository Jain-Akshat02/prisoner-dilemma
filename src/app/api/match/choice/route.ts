import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Match from "@/models/Match";
import Player from "@/models/Player";
import { calculatePayoff } from "@/lib/payoff";
import { Choice } from "@/models/Match";

export async function POST(req: NextRequest) {
  await connect();

  try {
    const { matchId, sessionId, choice }: { matchId: string; sessionId: string; choice: Choice } = await req.json();

    // --- Validation ---
    if (!matchId || !sessionId || !choice) {
      return NextResponse.json({ error: "matchId, sessionId and choice are required" }, { status: 400 });
    }
    if (!["cooperate", "betray"].includes(choice)) {
      return NextResponse.json({ error: "Choice must be cooperate or betray" }, { status: 400 });
    }

    // --- Find match ---
    const match = await Match.findById(matchId);
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
    if (match.status === "completed") {
      return NextResponse.json({ error: "Match already completed" }, { status: 400 });
    }

    // --- Identify player ---
    const player = await Player.findOne({ sessionId });
    if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const isPlayer1 = match.player1.toString() === player._id.toString();
    const isPlayer2 = match.player2.toString() === player._id.toString();

    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "You are not part of this match" }, { status: 403 });
    }

    // --- Prevent re-submission ---
    if (isPlayer1 && match.player1Choice) {
      return NextResponse.json({ error: "You already submitted your choice" }, { status: 400 });
    }
    if (isPlayer2 && match.player2Choice) {
      return NextResponse.json({ error: "You already submitted your choice" }, { status: 400 });
    }

    // --- Save choice ---
    if (isPlayer1) match.player1Choice = choice;
    if (isPlayer2) match.player2Choice = choice;

    // --- Resolve round if both submitted ---
    if (match.player1Choice && match.player2Choice) {
      const { player1Points, player2Points } = calculatePayoff(
        match.player1Choice,
        match.player2Choice
      );

      // Save round to history
      match.rounds.push({
        roundNumber: match.currentRound,
        player1Choice: match.player1Choice,
        player2Choice: match.player2Choice,
        player1Points,
        player2Points,
      });

      // Update cumulative match points
      match.player1TotalPoints += player1Points;
      match.player2TotalPoints += player2Points;

      // Update global scoreboard points on Player
      await Player.findByIdAndUpdate(match.player1, { $inc: { points: player1Points } });
      await Player.findByIdAndUpdate(match.player2, { $inc: { points: player2Points } });

      // Check if all rounds are done
      if (match.currentRound >= match.totalRounds) {
        match.status = "completed";
      } else {
        // Prepare for next round
        match.currentRound += 1;
        match.player1Choice = undefined;
        match.player2Choice = undefined;
      }

      await match.save();

      return NextResponse.json({
        success: true,
        roundComplete: true,
        waiting: false,
        roundNumber: match.currentRound,
        matchStatus: match.status,
        pointsEarned: isPlayer1 ? player1Points : player2Points,
        opponentChoice: isPlayer1 ? match.player2Choice : match.player1Choice, // reveal after round
        myChoice: choice,
      });
    }

    // --- Waiting for opponent ---
    await match.save();

    return NextResponse.json({
      success: true,
      roundComplete: false,
      waiting: true,
      message: "Waiting for opponent to submit",
      myChoice: choice,
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}