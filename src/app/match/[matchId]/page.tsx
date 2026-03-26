"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Choice, MatchState, STORAGE_KEYS, api, getErrorMessage } from "@/lib/gameClient";

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const matchId = params?.matchId || "";
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState<MatchState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Battle in progress.");
  const [loading, setLoading] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);

  useEffect(() => {
    const sid = localStorage.getItem(STORAGE_KEYS.sessionId) || "";
    if (!sid) {
      router.replace("/");
      return;
    }
    setSessionId(sid);
    localStorage.setItem(STORAGE_KEYS.matchId, matchId);
  }, [matchId, router]);

  const syncMatch = useCallback(async () => {
    if (!sessionId || !matchId) return;
    try {
      const data = await api<MatchState>(`/api/match/${matchId}?sessionId=${sessionId}`);
      setState(data);
      setSelectedChoice(data.myChoice);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  }, [matchId, sessionId]);

  useEffect(() => {
    void syncMatch();
    const id = setInterval(() => void syncMatch(), 1500);
    return () => clearInterval(id);
  }, [syncMatch]);

  // Keep the countdown "Timer" stat updated even when match polling doesn't change the deadline value.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const timer = useMemo(() => {
    if (!state?.roundDeadline) return "-";
    const diff = new Date(state.roundDeadline).getTime() - now;
    return `${Math.max(0, Math.ceil(diff / 1000))}s`;
  }, [state?.roundDeadline, state?.currentRound, now]);

  async function readyUp() {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api<{ matchStarted: boolean }>(`/api/match/${matchId}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      setStatus(res.matchStarted ? "Both players ready." : "Ready signal sent.");
      await syncMatch();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function submitChoice(choice: Choice) {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      setSelectedChoice(choice);
      const res = await api<{ waiting: boolean; roundComplete: boolean; message?: string }>("/api/match/choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, sessionId, choice }),
      });
      if (res.roundComplete) setStatus("Round complete. Scores updated.");
      else if (res.waiting) setStatus(res.message || "Waiting for opponent.");
      await syncMatch();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.12),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.15),transparent_45%)]]" />
      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-8">
        <header className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-300">Match</p>
          <h1 className="text-3xl font-black">Arena #{matchId.slice(0, 6)}</h1>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-red-100">{error}</div> : null}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">{status}</div>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Round" value={`${state?.currentRound ?? "-"} / ${state?.totalRounds ?? "-"}`} />
              <Stat label="You" value={String(state?.myTotalPoints ?? 0)} />
              <Stat label="Opponent" value={String(state?.opponentTotalPoints ?? 0)} />
              <Stat label="Timer" value={timer} />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-sm text-slate-300">Selected Action</p>
              <p className="text-xl font-bold capitalize">{selectedChoice || "Pending"}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={readyUp} disabled={loading} className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-2 text-amber-100 disabled:opacity-50">
                Ready
              </button>
              <button
                onClick={() => submitChoice("cooperate")}
                disabled={loading || state?.status !== "ongoing" || !!state?.myChoice}
                className="rounded-xl bg-linear-to-r from-emerald-400 to-lime-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
              >
                Cooperate
              </button>
              <button
                onClick={() => submitChoice("betray")}
                disabled={loading || state?.status !== "ongoing" || !!state?.myChoice}
                className="rounded-xl bg-linear-to-r from-rose-400 to-red-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
              >
                Betray
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold">Round Log</h3>
            <div className="mt-4 max-h-105 space-y-2 overflow-auto pr-1">
              {(state?.rounds || []).map((round) => (
                <div key={round.roundNumber} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                  <p className="font-semibold">Round {round.roundNumber}</p>
                  <p className="text-slate-300">
                    P1: {round.player1Choice} | P2: {round.player2Choice}
                  </p>
                  <p className="text-xs text-slate-400">
                    Points: {round.player1Points} - {round.player2Points}
                  </p>
                </div>
              ))}
              {(state?.rounds || []).length === 0 ? <p className="text-sm text-slate-400">No rounds completed yet.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
