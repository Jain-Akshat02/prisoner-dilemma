
import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/dbSetup";
import Match from "@/models/Match";
import Player from "@/models/Player";

export async function GET(
  req: NextRequest,
  { params }: { params: { matchId: string } }
) {
  await connect();
  // fetch match state + auto cooperate logic here
}

export async function POST(
  req: NextRequest,
  { params }: { params: { matchId: string } }
) {
  await connect();
  // submit choice logic here
}