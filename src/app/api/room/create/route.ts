import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Room from "@/models/Room";
import Player from "@/models/Player";

export async function POST(req: NextRequest) {
  try {
    await connect();
    const body = await req.json().catch(() => ({}));
    const playerName = body.playerName || "Player 1";

    // 1. Generate random strings
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sessionId = crypto.randomUUID(); // Built-in Node/Next.js ID generator

    // 2. Create the host player silently
    const player = await Player.create({
      name: playerName,
      sessionId: sessionId,
      points: 0,
      gamesPlayed: 0
    });

    // 3. Create the room
    const room = await Room.create({
      roomCode: roomCode,
      players: [player._id],
      matches: [],
      maxPlayers: 8,
      status: "waiting"
    });

    return NextResponse.json({
      success: true,
      message: "Room created successfully!",
      roomCode,
      sessionId,
      roomId: room._id
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
