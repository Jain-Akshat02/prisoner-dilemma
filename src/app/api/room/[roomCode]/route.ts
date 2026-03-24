import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Room from "@/models/Room";
import Player from "@/models/Player";
import Match from "@/models/Match";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  await connect();

  try {
    const { roomCode } = await params;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Find room
    const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Find player
    const player = await Player.findOne({ sessionId });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Get all players in room for scoreboard
    const players = await Player.find({ roomId: room._id }).select("name points isReady");

    // If game not started yet, return lobby state
    if (room.status === "waiting") {
      return NextResponse.json({
        success: true,
        status: "waiting",
        roomCode: room.roomCode,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        isHost: room.players[0].toString() === sessionId,
        players,
      });
    }

    // Game is ongoing — find this player's match
    const myMatch = await Match.findOne({
      roomId: room._id,
      $or: [
        { player1: player._id },
        { player2: player._id },
      ],
    });

    return NextResponse.json({
      success: true,
      status: room.status,
      roomCode: room.roomCode,
      matchId: myMatch?._id,         // frontend redirects to /match/[matchId]
      isHost: room.players[0].toString() === sessionId,
      players,                        // scoreboard
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}