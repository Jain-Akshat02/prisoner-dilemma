import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Room from "@/models/Room";
import Player from "@/models/Player";

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

    // Add new player to room and wait for host to start
    room.players.push(player._id);
    await room.save();

    return NextResponse.json({
      success: true,
      message: "Joined room, waiting for host to start...",
      roomCode: room.roomCode,
      sessionId: sessionId,
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
