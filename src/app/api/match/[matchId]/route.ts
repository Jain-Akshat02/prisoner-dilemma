import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Match from "@/models/Match";
import Player from "@/models/Player";
import { calculatePayoff } from "@/lib/payoff";

export async function GET(
  req: NextRequest,
  { params }: { params: { matchId: string } },
) {
  await connect();
  // fetch match state + auto cooperate logic here
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }
    const match = await Match.findById(params.matchId);
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
    // Auto cooperate if deadline passed
if (match.roundDeadline && new Date() > match.roundDeadline) {
  let roundResolved = false;

  if (!match.player1Choice) {
    match.player1Choice = "cooperate";
    roundResolved = true;
  }
  if (!match.player2Choice) {
    match.player2Choice = "cooperate";
    roundResolved = true;
  }

  // Both choices now present — resolve round
  if (roundResolved && match.player1Choice && match.player2Choice) {
    const { player1Points, player2Points } = calculatePayoff(
      match.player1Choice,
      match.player2Choice
    );

    match.rounds.push({
      roundNumber: match.currentRound,
      player1Choice: match.player1Choice,
      player2Choice: match.player2Choice,
      player1Points,
      player2Points,
    });

    match.player1TotalPoints += player1Points;
    match.player2TotalPoints += player2Points;

    await Player.findByIdAndUpdate(match.player1, { $inc: { points: player1Points } });
    await Player.findByIdAndUpdate(match.player2, { $inc: { points: player2Points } });

    if (match.currentRound >= match.totalRounds) {
      match.status = "completed";
    } else {
      match.currentRound += 1;
      match.player1Choice = undefined;
      match.player2Choice = undefined;
      match.roundDeadline = new Date(Date.now() + 8 * 1000); // reset deadline
    }

    await match.save();
const bothSubmitted = !!(match.player1Choice && match.player2Choice);

return NextResponse.json({
  success: true,
  status: match.status,
  currentRound: match.currentRound,
  totalRounds: match.totalRounds,
  roundDeadline: match.roundDeadline,
  myTotalPoints: isPlayer1 ? match.player1TotalPoints : match.player2TotalPoints,
  opponentTotalPoints: isPlayer1 ? match.player2TotalPoints : match.player1TotalPoints,
  myChoice: isPlayer1 ? match.player1Choice : match.player2Choice,
  opponentChoice: bothSubmitted
    ? isPlayer1 ? match.player2Choice : match.player1Choice
    : null,
  rounds: match.rounds,
});
  }
}
  } catch (error: unknown) {
  return NextResponse.json({ error: (error as Error).message }, { status: 500 });
}
}

export async function POST(
  req: NextRequest,
  { params }: { params: { matchId: string } },
) {
  await connect();
  // submit choice logic here
  
}
