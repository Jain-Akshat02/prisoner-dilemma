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
        //   // Pair them up and create the Match!
        for (let i = 0; i < room.players.length; i += 2) {
            const p1 = room.players[i];
            let p2 = room.players[i + 1];
            if (!p2) {
                // Randomly select one of the four bot strategies!
                const botTypes = ["bot_tft_", "bot_rnd_", "bot_grim_", "bot_pavlov_"];
                const pick = botTypes[Math.floor(Math.random() * botTypes.length)];

                const botPlayer = await Player.create({
                    name: "The Bot", // Hide the fact that it is a bot to human players
                    sessionId: pick + crypto.randomUUID(),
                    points: 0,
                    gamesPlayed: 0,
                });
                p2 = botPlayer._id;
            }
            const match = await Match.create({
                roomId: room._id,
                player1: p1,
                player2: p2,
                status: "ongoing", // Since 2 players are here, the match begins.
                currentRound: 1,
                totalRounds: 10,
                player1TotalPoints: 0,
                player2TotalPoints: 0,
                roundDeadline: new Date(Date.now() + 8000)
            });
            room.matches.push(match._id);
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
