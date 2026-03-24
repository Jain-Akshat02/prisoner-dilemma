export type Choice = "cooperate" | "betray";

export type RoomState = {
  status: "waiting" | "ongoing" | "completed";
  roomCode: string;
  playerCount?: number;
  maxPlayers?: number;
  isHost?: boolean;
  players?: Array<{ name: string; points: number; isReady?: boolean }>;
  matchId?: string;
};

export type Round = {
  roundNumber: number;
  player1Choice: Choice;
  player2Choice: Choice;
  player1Points: number;
  player2Points: number;
};

export type MatchState = {
  status: "waiting" | "ongoing" | "completed";
  currentRound: number;
  totalRounds: number;
  roundDeadline?: string;
  myTotalPoints: number;
  opponentTotalPoints: number;
  myChoice: Choice | null;
  opponentChoice: Choice | null;
  rounds: Round[];
};

export const STORAGE_KEYS = {
  roomCode: "pd_room_code",
  sessionId: "pd_session_id",
  matchId: "pd_match_id",
  playerName: "pd_player_name",
  isHost: "pd_is_host",
} as const;

export function getErrorMessage(value: unknown): string {
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message: string }).message);
  }
  return "Something went wrong. Please try again.";
}

export async function api<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data as T;
}
