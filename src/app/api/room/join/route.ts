import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Room from "@/models/Room";
import Player from "@/models/Player";
import Match from "@/models/Match";

export async function POST(req: NextRequest) {
  try {
    await connect();
    const body = await req.json().catch(() => ({}));
    const { roomCode, playerName = "Player 2" } = body;

    if (!roomCode) {
      return NextResponse.json({ error: "roomCode is required in JSON body" }, { status: 400 });
    }

    // 1. Find the Room
    const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.players.length >= room.maxPlayers) {
      return NextResponse.json({ error: "Room is full" }, { status: 400 });
    }

    // 2. Create joining player silently
    const sessionId = crypto.randomUUID();
    const player = await Player.create({
      name: playerName,
      sessionId: sessionId,
      points: 0,
      gamesPlayed: 0
    });

    // 3. Check if there is someone waiting for a match (an odd number of players)
    let newMatchId = null;
    if (room.players.length % 2 !== 0) {
      // The last person in the array doesn't have a partner yet!
      const waitingPlayerId = room.players[room.players.length - 1];

      // Pair them up and create the Match!
      const match = await Match.create({
        roomId: room._id,
        player1: waitingPlayerId,
        player2: player._id,
        status: "ongoing", // Since 2 players are here, the match begins.
        currentRound: 1,
        totalRounds: 10,
        player1TotalPoints: 0,
        player2TotalPoints: 0
      });

      room.matches.push(match._id);
      newMatchId = match._id;
    }

    // Add new player to room
    room.players.push(player._id);

    // Start room if full
    if (room.players.length >= room.maxPlayers) {
      room.status = "ongoing";
    }
    await room.save();

    return NextResponse.json({
      success: true,
      message: newMatchId ? "Joined room and match created!" : "Joined room, waiting for an opponent...",
      roomCode: room.roomCode,
      sessionId: sessionId,
      matchId: newMatchId
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
