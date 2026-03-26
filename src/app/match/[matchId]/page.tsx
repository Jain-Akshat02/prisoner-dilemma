"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Choice, MatchState, STORAGE_KEYS, api, getErrorMessage } from "@/lib/gameClient";

type RoundResult = {
  roundNumber: number;
  myChoice: Choice;
  opponentChoice: Choice;
  myPoints: number;
  opponentPoints: number;
};

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const matchId = params?.matchId || "";
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState<MatchState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);

  // Round transition overlay: "Round X" flash
  const [roundAnnounce, setRoundAnnounce] = useState<number | null>(null);
  const announceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Result break: show last round result for 3s before allowing next action
  const [resultBreak, setResultBreak] = useState<RoundResult | null>(null);
  const resultTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track what round we last announced and how many rounds we've seen
  const lastAnnouncedRound = useRef(0);
  const lastRoundCount = useRef(0);

  // Track player perspective (are we player1 or player2?)
  const isPlayer1Ref = useRef<boolean | null>(null);

  useEffect(() => {
    const sid = localStorage.getItem(STORAGE_KEYS.sessionId) || "";
    if (!sid) { router.replace("/"); return; }
    setSessionId(sid);
    localStorage.setItem(STORAGE_KEYS.matchId, matchId);
  }, [matchId, router]);

  const syncMatch = useCallback(async () => {
    if (!sessionId || !matchId) return;
    try {
      const data = await api<MatchState>(`/api/match/${matchId}?sessionId=${sessionId}`);

      // Infer player perspective once: if myTotalPoints matches player1TotalPoints on first resolved round
      // Simpler: track via the first round where myChoice is known before it clears
      // We store perspective when we first see myChoice set
      if (isPlayer1Ref.current === null && data.rounds.length > 0) {
        // Compare myTotalPoints against player1TotalPoints from rounds sum
        const p1Sum = data.rounds.reduce((s, r) => s + r.player1Points, 0);
        isPlayer1Ref.current = data.myTotalPoints === p1Sum;
      }

      // Detect new round result (rounds array grew)
      if (data.rounds.length > lastRoundCount.current && data.rounds.length > 0) {
        const latest = data.rounds[data.rounds.length - 1];
        const iP1 = isPlayer1Ref.current !== false; // default to p1 if unknown
        const result: RoundResult = {
          roundNumber: latest.roundNumber,
          myChoice: (iP1 ? latest.player1Choice : latest.player2Choice) as Choice,
          opponentChoice: (iP1 ? latest.player2Choice : latest.player1Choice) as Choice,
          myPoints: iP1 ? latest.player1Points : latest.player2Points,
          opponentPoints: iP1 ? latest.player2Points : latest.player1Points,
        };
        lastRoundCount.current = data.rounds.length;

        // Show result break for 3s (unless match is completed — still show it)
        if (resultTimeout.current) clearTimeout(resultTimeout.current);
        setResultBreak(result);
        resultTimeout.current = setTimeout(() => {
          setResultBreak(null);
        }, 3000);
      }

      // Detect round number change → show "Round X" announcement
      if (
        data.status === "ongoing" &&
        data.currentRound !== lastAnnouncedRound.current
      ) {
        lastAnnouncedRound.current = data.currentRound;
        if (announceTimeout.current) clearTimeout(announceTimeout.current);
        setRoundAnnounce(data.currentRound);
        announceTimeout.current = setTimeout(() => setRoundAnnounce(null), 1800);
      }

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

  // Smooth 100ms timer tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (announceTimeout.current) clearTimeout(announceTimeout.current);
      if (resultTimeout.current) clearTimeout(resultTimeout.current);
    };
  }, []);

  const timerSeconds = useMemo(() => {
    if (!state?.roundDeadline) return null;
    const diff = new Date(state.roundDeadline).getTime() - now;
    return Math.max(0, diff / 1000);
  }, [state?.roundDeadline, now]);

  const timerDisplay = timerSeconds === null ? "-" : `${timerSeconds.toFixed(1)}s`;
  const timerUrgent = timerSeconds !== null && timerSeconds <= 3;

  async function readyUp() {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      await api<{ matchStarted: boolean }>(`/api/match/${matchId}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
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
      await api<{ waiting: boolean; roundComplete: boolean }>("/api/match/choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, sessionId, choice }),
      });
      await syncMatch();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // Buttons are locked during result break or round announcement
  const actionsLocked = loading || !!resultBreak || !!roundAnnounce;

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.12),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.15),transparent_45%)]" />

      {/* ── Round Announcement Overlay ── */}
      {roundAnnounce !== null && (
        <div
          key={`announce-${roundAnnounce}`}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-300"
          style={{ animation: "roundAnnounce 1.8s ease forwards" }}
        >
          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.4em] text-slate-400 mb-2">Get Ready</p>
            <p className="text-8xl font-black tracking-widest text-white drop-shadow-[0_0_40px_rgba(34,211,238,0.8)]">
              Round {roundAnnounce}
            </p>
          </div>
        </div>
      )}

      {/* ── Result Break Overlay ── */}
      {resultBreak !== null && (
        <div
          key={`result-${resultBreak.roundNumber}`}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300"
        >
          <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-10 text-center shadow-2xl">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400 mb-4">Round {resultBreak.roundNumber} Result</p>
            <div className="flex gap-12 justify-center mb-6">
              <div>
                <p className="text-xs text-slate-400 mb-1">You</p>
                <p className={`text-2xl font-black capitalize ${resultBreak.myChoice === "cooperate" ? "text-emerald-400" : "text-rose-400"}`}>
                  {resultBreak.myChoice}
                </p>
                <p className="text-3xl font-black text-white mt-2">+{resultBreak.myPoints}</p>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <p className="text-xs text-slate-400 mb-1">Opponent</p>
                <p className={`text-2xl font-black capitalize ${resultBreak.opponentChoice === "cooperate" ? "text-emerald-400" : "text-rose-400"}`}>
                  {resultBreak.opponentChoice}
                </p>
                <p className="text-3xl font-black text-white mt-2">+{resultBreak.opponentPoints}</p>
              </div>
            </div>
            <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full animate-[shrink_3s_linear_forwards]" />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes roundAnnounce {
          0%   { opacity: 0; transform: scale(0.85); }
          20%  { opacity: 1; transform: scale(1.05); }
          60%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.1); }
        }
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-8">
        <header className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-300">Match</p>
          <h1 className="text-3xl font-black">Arena #{matchId.slice(0, 6)}</h1>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-red-100">{error}</div> : null}

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Round" value={`${state?.currentRound ?? "-"} / ${state?.totalRounds ?? "-"}`} />
              <Stat label="You" value={String(state?.myTotalPoints ?? 0)} />
              <Stat label="Opponent" value={String(state?.opponentTotalPoints ?? 0)} />
              <div className={`rounded-xl border p-3 transition-colors ${timerUrgent ? "border-red-400/40 bg-red-500/10" : "border-white/10 bg-white/5"}`}>
                <p className="text-xs uppercase tracking-wider text-slate-400">Timer</p>
                <p className={`text-lg font-semibold font-mono tabular-nums ${timerUrgent ? "text-red-400 animate-pulse" : ""}`}>
                  {timerDisplay}
                </p>
              </div>
            </div>

            {/* Selected action display */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-sm text-slate-300">Selected Action</p>
              <p className="text-xl font-bold capitalize">{selectedChoice || "Pending"}</p>
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex flex-wrap gap-3">
              {state?.status === "waiting" && (
                <button
                  onClick={readyUp}
                  disabled={actionsLocked}
                  className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-2 text-amber-100 disabled:opacity-50"
                >
                  Ready
                </button>
              )}
              {state?.status === "ongoing" && (
                <>
                  <button
                    onClick={() => submitChoice("cooperate")}
                    disabled={actionsLocked || !!state?.myChoice}
                    className="rounded-xl bg-linear-to-r from-emerald-400 to-lime-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
                  >
                    Cooperate
                  </button>
                  <button
                    onClick={() => submitChoice("betray")}
                    disabled={actionsLocked || !!state?.myChoice}
                    className="rounded-xl bg-linear-to-r from-rose-400 to-red-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
                  >
                    Betray
                  </button>
                </>
              )}
              {state?.status === "completed" && (
                <p className="text-sm text-slate-400">Match complete.</p>
              )}
            </div>

            {/* Waiting for opponent indicator */}
            {state?.status === "ongoing" && state?.myChoice && !resultBreak && (
              <p className="mt-4 text-sm text-slate-400 animate-pulse">Waiting for opponent...</p>
            )}
          </div>

          {/* Round log */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <h3 className="text-lg font-semibold">Round Log</h3>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
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
              {(state?.rounds || []).length === 0
                ? <p className="text-sm text-slate-400">No rounds completed yet.</p>
                : null}
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
