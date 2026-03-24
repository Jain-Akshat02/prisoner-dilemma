"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoomState, STORAGE_KEYS, api, getErrorMessage } from "@/lib/gameClient";

export default function LobbyPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();
  const roomCode = (params?.roomCode || "").toUpperCase();
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState("Waiting for players...");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sid = localStorage.getItem(STORAGE_KEYS.sessionId) || "";
    if (!sid) {
      router.replace("/");
      return;
    }
    setSessionId(sid);
    localStorage.setItem(STORAGE_KEYS.roomCode, roomCode);
  }, [roomCode, router]);

  const syncLobby = useCallback(async () => {
    if (!sessionId || !roomCode) return;
    try {
      const data = await api<RoomState>(`/api/room/${roomCode}?sessionId=${sessionId}`);
      setState(data);
      if (data.status === "ongoing" && data.matchId) {
        localStorage.setItem(STORAGE_KEYS.matchId, String(data.matchId));
        router.replace(`/match/${data.matchId}`);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  }, [roomCode, router, sessionId]);

  useEffect(() => {
    void syncLobby();
    const id = setInterval(() => void syncLobby(), 2000);
    return () => clearInterval(id);
  }, [syncLobby]);

  async function startGame() {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api<{ message: string }>("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, sessionId }),
      });
      setStatus(res.message);
      await syncLobby();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.2),_transparent_40%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-8">
        <header className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Lobby</p>
          <h1 className="text-3xl font-black">Room {roomCode}</h1>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-red-100">{error}</div> : null}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">{status}</div>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Control Deck</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-slate-400">Players</p>
                <p className="font-semibold">{state?.playerCount ?? 0} / {state?.maxPlayers ?? 8}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-slate-400">Status</p>
                <p className="font-semibold capitalize">{state?.status || "waiting"}</p>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={syncLobby}
                className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-4 py-2 text-cyan-100"
              >
                Refresh
              </button>
              {state?.isHost ? (
                <button
                  onClick={startGame}
                  disabled={loading}
                  className="rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
                >
                  {loading ? "Starting..." : "Start Tournament"}
                </button>
              ) : (
                <p className="self-center text-sm text-slate-400">Host will start the game.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold">Players</h3>
            <div className="mt-4 space-y-2">
              {(state?.players || []).map((player, idx) => (
                <div key={`${player.name}-${idx}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="font-medium">{player.name}</p>
                  <p className="text-xs text-slate-400">Points: {player.points}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
