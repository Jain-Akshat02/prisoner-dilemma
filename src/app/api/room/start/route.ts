import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Room from "@/models/Room";
import Player from "@/models/Player";
import Match from "@/models/Match";

export async function POST(req: NextRequest) {
    try {
        await connect();
        const body = await req.json().catch(() => ({}));
        const { sessionId, roomCode } = body;
        if (!sessionId || !roomCode) {
            return NextResponse.json({
                error: "Not valid information!"
            }, { status: 400 });
        }
        // 1. Find the Room
        const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
        if (!room) {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }
        //2 confirm host
        const hostPlayer = await Player.findOne({ sessionId: sessionId });
        if (!hostPlayer) {
            return NextResponse.json({ error: "Host not found" }, { status: 404 });
        }
        // Because MongoDB ObjectIds are weird objects, you have to use .toString() to compare them!
        if (hostPlayer._id.toString() !== room.players[0].toString()) {
            return NextResponse.json({ error: "Only the Host can start the game!" }, { status: 403 });
        }
        // 3. Check if there are enough players (at least 2)
        if (room.players.length < 2) {
            return NextResponse.json({
                error: "atleast 2 players required"
            }, { status: 400 })
        }

        // 4. If players are odd, add a bot to make it even
        if (room.players.length % 2 !== 0) {
            const botTypes = ["bot_tft_", "bot_rnd_", "bot_grim_", "bot_pavlov_"];
            const pick = botTypes[Math.floor(Math.random() * botTypes.length)];

            const botPlayer = await Player.create({
                name: "The Bot",
                sessionId: pick + crypto.randomUUID(),
                points: 0,
                gamesPlayed: 0,
            });
            room.players.push(botPlayer._id);
        }

        // 5. Generate Round-Robin Pairs using Circle Method
        const players = room.players;
        const numPlayers = players.length;
        const numRounds = numPlayers - 1;
        const halfSize = numPlayers / 2;
        
        const rotationIndices = Array.from({ length: numPlayers }, (_, i) => i);
        
        for (let round = 0; round < numRounds; round++) {
            for (let i = 0; i < halfSize; i++) {
                const p1Index = rotationIndices[i];
                const p2Index = rotationIndices[numPlayers - 1 - i];
                
                const match = await Match.create({
                    roomId: room._id,
                    player1: players[p1Index],
                    player2: players[p2Index],
                    status: "waiting", // matches start waiting
                    currentRound: 1,
                    totalRounds: 10,
                    player1TotalPoints: 0,
                    player2TotalPoints: 0
                });
                room.matches.push(match._id);
            }
            // Rotate the indices (exclude the first element at index 0)
            const lastIndex = rotationIndices.pop() as number;
            rotationIndices.splice(1, 0, lastIndex);
        }
        room.status = "ongoing";
        await room.save();
        return NextResponse.json({
            success: true,
            message: "Game started successfully!",
            roomCode: room.roomCode,
            sessionId: sessionId
        });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
