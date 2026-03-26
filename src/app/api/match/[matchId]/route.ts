import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Match from "@/models/Match";
import Player from "@/models/Player";
import { calculatePayoff } from "@/lib/payoff";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  await connect();
  // fetch match state + auto cooperate logic here
  try {
    const { matchId } = await params;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }
    let match = await Match.findById(matchId);
    if (!match)
      return NextResponse.json({ error: "Match not found" }, { status: 404 });

    // 3. Find player
    const player = await Player.findOne({ sessionId });
    if (!player)
      return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const isPlayer1 = match.player1.toString() === player._id.toString();
    const isPlayer2 = match.player2.toString() === player._id.toString();

    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json(
        { error: "You are not part of this match" },
        { status: 403 },
      );
    }
    const intendedRound = match.currentRound;
    // Auto cooperate if deadline passed
    if (match.roundDeadline && new Date() > match.roundDeadline) {

      if (!match.player1Choice) {
        match.player1Choice = "cooperate";

      }
      if (!match.player2Choice) {
        match.player2Choice = "cooperate";

      }

      // Both choices now present — resolve round
      if (match.player1Choice && match.player2Choice) {
        const { player1Points, player2Points } = calculatePayoff(
          match.player1Choice,
          match.player2Choice,
        );
        const resolveResult = await Match.findOneAndUpdate(
          {
            _id: matchId,
            currentRound: intendedRound, // round must still be same
            resolvedRoundNumber: { $lt: intendedRound }, // round must NOT be resolved yet
          },
          {
            $set: {
              resolvedRoundNumber: intendedRound,
              ...(intendedRound >= match.totalRounds
                ? { status: "completed" }
                : {
                    currentRound: intendedRound + 1,
                    roundDeadline: new Date(Date.now() + 8000),
                  }),
            },
            $push: {
              rounds: {
                roundNumber: match.currentRound,
                player1Choice: match.player1Choice,
                player2Choice: match.player2Choice,
                player1Points,
                player2Points,
              },
            },
            $inc: {
              player1TotalPoints: player1Points,
              player2TotalPoints: player2Points,
            },
            $unset: { player1Choice: "", player2Choice: "" }, // clear choices for next round
          },
          { new: true }
        );
        if (!resolveResult) {
          // Another request already resolved this round. Reload and fall back to normal response.
          match = await Match.findById(matchId);
          if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
        } else {
          await Player.findByIdAndUpdate(match.player1, {
            $inc: { points: player1Points },
          });
          await Player.findByIdAndUpdate(match.player2, {
            $inc: { points: player2Points },
          });

          const bothSubmitted = !!(resolveResult.player1Choice && resolveResult.player2Choice);

          return NextResponse.json({
            success: true,
            status: resolveResult.status,
            currentRound: resolveResult.currentRound,
            totalRounds: resolveResult.totalRounds,
            roundDeadline: resolveResult.roundDeadline,
            myTotalPoints: isPlayer1
              ? resolveResult.player1TotalPoints
              : resolveResult.player2TotalPoints,
            opponentTotalPoints: isPlayer1
              ? resolveResult.player2TotalPoints
              : resolveResult.player1TotalPoints,
            myChoice: isPlayer1 ? resolveResult.player1Choice ?? null : resolveResult.player2Choice ?? null,
            opponentChoice: bothSubmitted
              ? isPlayer1
                ? resolveResult.player2Choice ?? null
                : resolveResult.player1Choice ?? null
              : null,
            rounds: resolveResult.rounds,
          });
        }
      }
      
    }

    // Normal non-deadline path (or deadline passed but another request resolved first).
    const bothSubmitted = !!(match.player1Choice && match.player2Choice);

    return NextResponse.json({
      success: true,
      status: match.status,
      currentRound: match.currentRound,
      totalRounds: match.totalRounds,
      roundDeadline: match.roundDeadline,
      myTotalPoints: isPlayer1 ? match.player1TotalPoints : match.player2TotalPoints,
      opponentTotalPoints: isPlayer1 ? match.player2TotalPoints : match.player1TotalPoints,
      myChoice: isPlayer1 ? match.player1Choice ?? null : match.player2Choice ?? null,
      opponentChoice: bothSubmitted ? (isPlayer1 ? match.player2Choice ?? null : match.player1Choice ?? null) : null,
      rounds: match.rounds,
    });
} catch {
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}
}