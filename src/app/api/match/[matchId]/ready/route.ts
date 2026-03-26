import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Match from "@/models/Match";
import Player from "@/models/Player";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  await connect();

  try {
    const { matchId } = await params;
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.status !== "waiting") {
      // If it's already ongoing or completed, just return success
      return NextResponse.json({ success: true, status: match.status });
    }

    const player = await Player.findOne({ sessionId });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const isPlayer1 = match.player1.toString() === player._id.toString();
    const isPlayer2 = match.player2.toString() === player._id.toString();

    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "You are not part of this match" }, { status: 403 });
    }

    // Mark the human player as ready
    if (isPlayer1) match.player1Ready = true;
    if (isPlayer2) match.player2Ready = true;

    // Check if the opponent is a bot. If so, auto-ready the bot.
    let p1Ready = match.player1Ready;
    let p2Ready = match.player2Ready;

    if (isPlayer1 && !p2Ready) {
      const opponent = await Player.findById(match.player2);
      if (opponent && opponent.sessionId.startsWith("bot_")) {
        p2Ready = true;
        match.player2Ready = true;
      }
    } else if (isPlayer2 && !p1Ready) {
      const opponent = await Player.findById(match.player1);
      if (opponent && opponent.sessionId.startsWith("bot_")) {
        p1Ready = true;
        match.player1Ready = true;
      }
    }

    // If both are ready, start the match!
    let matchStarted = false;
    if (p1Ready && p2Ready && match.status === "waiting") {
      match.status = "ongoing";
      // First round deadline starts NOW
      match.roundDeadline = new Date(Date.now() + 13000);
      matchStarted = true;
    }

    await match.save();

    return NextResponse.json({
      success: true,
      matchStarted,
      status: match.status,
      roundDeadline: match.roundDeadline,
      player1Ready: p1Ready,
      player2Ready: p2Ready
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
