"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
// Types
type Choice = "cooperate" | "betray";
type Phase = "home" | "lobby" | "match";

type Round = {
  roundNumber: number;
  player1Choice: Choice;
  player2Choice: Choice;
  player1Points: number;
  player2Points: number;
};

type RoomState = {
  status: "waiting" | "ongoing" | "completed";
  roomCode: string;
  playerCount?: number;
  maxPlayers?: number;
  isHost?: boolean;
  players?: Array<{ name: string; points: number; isReady?: boolean }>;
  matchId?: string;
};

type MatchState = {
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

const STORAGE_KEYS = {
  roomCode: "pd_room_code",
  sessionId: "pd_session_id",
  matchId: "pd_match_id",
  playerName: "pd_player_name",
} as const;

function getErrorMessage(value: unknown): string {
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message: string }).message);
  }
  return "An unknown anomaly occurred.";
}

async function api<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "System rejected request");
  }
  return data as T;
}

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("home");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Awaiting your command.");
  const [fatalError, setFatalError] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const countdownSeconds = useMemo(() => {
    if (!matchState?.roundDeadline) return null;
    const diff = new Date(matchState.roundDeadline).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 1000));
  }, [matchState?.roundDeadline, matchState?.currentRound, matchState?.status]);

  // Force re-renders every second for the countdown
  useEffect(() => {
    if (phase !== "match" || !matchState?.roundDeadline) return;
    const id = setInterval(() => {
        setLoading(l => l); // trigger render
    }, 1000);
    return () => clearInterval(id);
  }, [phase, matchState?.roundDeadline, matchState?.status]);

  const persistSession = useCallback((next: {
    roomCode?: string;
    sessionId?: string;
    matchId?: string;
    playerName?: string;
  }) => {
    if (next.roomCode !== undefined) localStorage.setItem(STORAGE_KEYS.roomCode, next.roomCode);
    if (next.sessionId !== undefined) localStorage.setItem(STORAGE_KEYS.sessionId, next.sessionId);
    if (next.matchId !== undefined) localStorage.setItem(STORAGE_KEYS.matchId, next.matchId);
    if (next.playerName !== undefined) localStorage.setItem(STORAGE_KEYS.playerName, next.playerName);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.clear();
    setRoomCode("");
    setSessionId("");
    setMatchId("");
    setRoomState(null);
    setMatchState(null);
    setSelectedChoice(null);
    setFatalError("");
    setMessage("Connection severed. Ready for new sync.");
    setPhase("home");
  }, []);

  function handleLogoClick() {
    const inActiveGame = phase !== "home" || !!matchId || !!roomCode;
    if (inActiveGame) {
      setShowLeaveConfirm(true);
      return;
    }
    setPhase("home");
  }

  const syncRoom = useCallback(async () => {
    if (!roomCode || !sessionId) return;
    try {
      const data = await api<RoomState>(`/api/room/${roomCode}?sessionId=${sessionId}`);
      setRoomState(data);
      if (data.status === "ongoing" && data.matchId) {
        setMatchId(String(data.matchId));
        persistSession({ matchId: String(data.matchId) });
        setPhase("match");
      } else {
        setPhase("lobby");
      }
    } catch (error: unknown) {
      setFatalError(getErrorMessage(error));
    }
  }, [roomCode, sessionId, persistSession]);

  const syncMatch = useCallback(async () => {
    if (!matchId || !sessionId) return;
    try {
      const data = await api<MatchState>(`/api/match/${matchId}?sessionId=${sessionId}`);
      setMatchState(data);
      // Only keep local selection if we haven't received opponent choice
      if (data.myChoice) setSelectedChoice(data.myChoice);
      else setSelectedChoice(null);
      setPhase("match");
    } catch (error: unknown) {
      setFatalError(getErrorMessage(error));
    }
  }, [matchId, sessionId]);

  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEYS.playerName) || "";
    const savedRoomCode = localStorage.getItem(STORAGE_KEYS.roomCode) || "";
    const savedSessionId = localStorage.getItem(STORAGE_KEYS.sessionId) || "";
    const savedMatchId = localStorage.getItem(STORAGE_KEYS.matchId) || "";
    
    setPlayerName(savedName);
    setRoomCode(savedRoomCode);
    setSessionId(savedSessionId);
    setMatchId(savedMatchId);

    if (savedRoomCode && savedSessionId) {
      setMessage("Session recovered. Re-establishing uplink...");
      if (savedMatchId) setPhase("match");
      else setPhase("lobby");
    }
  }, []);

  useEffect(() => {
    if (phase === "lobby") {
      void syncRoom();
      const id = setInterval(() => void syncRoom(), 2500);
      return () => clearInterval(id);
    }
  }, [phase, syncRoom]);

  useEffect(() => {
    if (phase === "match") {
      void syncMatch();
      const id = setInterval(() => void syncMatch(), 1500);
      return () => clearInterval(id);
    }
  }, [phase, syncMatch]);

  async function handleCreateRoom() {
    if (!playerName.trim()) return setFatalError("Callsign required.");
    setLoading(true); setFatalError("");
    try {
      const data = await api<{ roomCode: string; sessionId: string; message: string }>("/api/room/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName }),
      });
      setRoomCode(data.roomCode); setSessionId(data.sessionId); setMatchId("");
      persistSession({ roomCode: data.roomCode, sessionId: data.sessionId, matchId: "", playerName });
      setMessage(`Uplink secured. Room: ${data.roomCode}`);
      setPhase("lobby");
    } catch (error: unknown) { setFatalError(getErrorMessage(error)); } finally { setLoading(false); }
  }

  async function handleJoinRoom() {
    if (!joinCode.trim() || !playerName.trim()) return setFatalError("Callsign and Access Code required.");
    setLoading(true); setFatalError("");
    try {
      const data = await api<{ roomCode: string; sessionId: string; matchId?: string; message: string }>(
        "/api/room/join", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: joinCode.trim().toUpperCase(), playerName }),
        }
      );
      // const nextMatchId = data.matchId ? String(data.matchId) : "";
      // setRoomCode(data.roomCode); setSessionId(data.sessionId); setMatchId(nextMatchId);
      // persistSession({ roomCode: data.roomCode, sessionId: data.sessionId, matchId: nextMatchId, playerName });
      // setMessage(data.message);
      // setPhase(nextMatchId ? "match" : "lobby");
    } catch (error: unknown) { setFatalError(getErrorMessage(error)); } finally { setLoading(false); }
  }

  async function handleStartGame() {
    if (!roomCode || !sessionId) return;
    setLoading(true); setFatalError("");
    try {
      const data = await api<{ message: string }>("/api/room/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, sessionId }),
      });
      setMessage(data.message);
      await syncRoom();
    } catch (error: unknown) { setFatalError(getErrorMessage(error)); } finally { setLoading(false); }
  }

  async function handleReady() {
    if (!matchId || !sessionId) return;
    setLoading(true); setFatalError("");
    try {
      const data = await api<{ status: string; matchStarted: boolean }>(`/api/match/${matchId}/ready`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      setMessage(data.matchStarted ? "The grid is active." : "Ready signal logged. Waiting on opponent...");
      await syncMatch();
    } catch (error: unknown) { setFatalError(getErrorMessage(error)); } finally { setLoading(false); }
  }

  async function handleChoice(choice: Choice) {
    if (!matchId || !sessionId) return;
    setLoading(true); setFatalError("");
    try {
      setSelectedChoice(choice);
      const data = await api<{ waiting: boolean; roundComplete: boolean; message?: string }>("/api/match/choice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, sessionId, choice }),
      });
      setMessage(data.roundComplete ? "Round resolved." : "Choice logged. Awaiting opponent.");
      await syncMatch();
    } catch (error: unknown) { 
      setFatalError(getErrorMessage(error)); 
      setSelectedChoice(null); // Revert selection on error
    } finally { 
      setLoading(false); 
    }
  }

  return (
    !isMounted ? (
      <main className="min-h-screen bg-neutral-950" />
    ) : (
    <main className="relative min-h-screen bg-neutral-950 font-sans text-neutral-200 selection:bg-cyan-500/30">
      {/* Background Animated Glitches / Gradients */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] h-[50vw] w-[50vw] rounded-full bg-cyan-900/20 blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50vw] w-[50vw] rounded-full bg-fuchsia-900/10 blur-[150px]" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_100%_100%_at_50%_50%,#000_10%,transparent_80%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 md:px-12 md:py-8">
        {/* Header Ribbon */}
        <header className="mb-8 flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-center md:text-left">
          
            <div className="flex items-center gap-3 p-4">
      
      {/* Logo → Clickable */}
    <button onClick={handleLogoClick} className="overflow-hidden rounded-full ring-2 ring-cyan-500/40 transition hover:ring-cyan-300/80">
    <Image
      src="/logo.png"
      alt="Game Logo"
      width={150}
      height={150}
      className="object-cover"
    />
  </button>

      {/* Game Name */}
      <h1 className="text-2xl font-bold tracking-wide">
        Prisoner's Dilemma
      </h1>

    </div>
            <p className="mt-2 text-sm font-light tracking-[0.2em] text-cyan-500/80 uppercase">
              Trust is a vulnerability
            </p>
          </div>
          
          {(roomCode || matchId) && (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Callsign</span>
                <span className="text-sm font-medium text-cyan-300">{playerName}</span>
              </div>
              <button
                onClick={clearSession}
                className="group relative overflow-hidden rounded-full border border-red-500/30 bg-red-500/10 px-6 py-2 pb-[10px] text-xs font-bold tracking-widest text-red-400 uppercase transition-all hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              >
                Abort
                <div className="absolute bottom-0 left-0 h-[2px] w-full bg-red-400/50 scale-x-0 transition-transform group-hover:scale-x-100" />
              </button>
            </div>
          )}
        </header>

        {/* Global Alert Banners */}
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {fatalError && (
            <div className="rounded-xl border border-red-500/50 bg-red-950/50 p-4 text-center text-sm font-medium text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.2)] backdrop-blur-md">
              <span className="mr-2 font-bold uppercase text-red-500">Error //</span> {fatalError}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-center text-xs font-semibold tracking-widest text-cyan-300 uppercase backdrop-blur-sm">
              {message}
            </div>
          )}
        </div>

        {/* --- PHASE: HOME --- */}
        {phase === "home" && (
          <div className="mx-auto mt-12 w-full max-w-md transition-all duration-500 translate-y-0 opacity-100">
            <div className="group relative rounded-3xl border border-white/5 bg-neutral-900/60 p-8 pt-10 backdrop-blur-2xl transition-all hover:border-cyan-500/30 hover:bg-neutral-900/80 hover:shadow-[0_0_40px_rgba(34,211,238,0.15)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-cyan-500/30 bg-neutral-950 px-4 py-1 text-[10px] font-bold tracking-[0.3em] text-cyan-500 uppercase shadow-[0_0_10px_rgba(34,211,238,0.1)]">
                Access Terminal
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">Identify</label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="ENTER CALLSIGN"
                    maxLength={16}
                    className="w-full rounded-none border-b border-neutral-800 bg-transparent px-2 py-3 text-center text-2xl font-light tracking-widest text-white outline-none transition-all placeholder:text-neutral-800 focus:border-cyan-400 focus:text-cyan-100 focus:placeholder:text-cyan-900/50"
                  />
                </div>

                <div className="space-y-4 pt-6">
                  <button
                    onClick={handleCreateRoom}
                    disabled={loading || !playerName}
                    className="relative w-full overflow-hidden rounded-xl bg-cyan-500 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%,100%_100%] bg-[position:100%_0,0_0] bg-no-repeat px-4 py-4 font-bold tracking-widest text-cyan-950 uppercase shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all hover:bg-cyan-400 hover:bg-[position:0_0,0_0] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] disabled:opacity-50"
                  >
                    Initialize Matrix
                  </button>

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-800/50" /></div>
                    <div className="relative flex justify-center"><span className="bg-neutral-900/80 px-4 text-[10px] tracking-widest text-neutral-500 uppercase">Or Infiltrate</span></div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="CODE"
                      maxLength={6}
                      className="w-2/3 rounded-xl border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.2em] uppercase text-fuchsia-300 outline-none transition-all placeholder:text-neutral-800 focus:border-fuchsia-400 focus:shadow-[0_0_15px_rgba(217,70,239,0.1)]"
                    />
                    <button
                      onClick={handleJoinRoom}
                      disabled={loading || joinCode.length < 4 || !playerName}
                      className="w-1/3 rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/10 px-4 font-bold tracking-widest text-fuchsia-300 uppercase shadow-[0_0_10px_rgba(217,70,239,0.1)] transition-all hover:bg-fuchsia-500 hover:text-white hover:shadow-[0_0_20px_rgba(217,70,239,0.4)] disabled:opacity-50"
                    >
                      Sync
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PHASE: LOBBY --- */}
        {phase === "lobby" && (
          <div className="mx-auto mt-8 w-full max-w-4xl space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col items-center justify-between gap-6 rounded-3xl border border-cyan-500/20 bg-neutral-900/60 p-8 shadow-[0_0_40px_rgba(34,211,238,0.05)] backdrop-blur-2xl md:flex-row md:p-12">
              <div className="text-center md:text-left">
                <p className="text-[10px] font-bold tracking-[0.4em] text-neutral-500 uppercase">Broadcast Code</p>
                <h2 className="mt-2 text-6xl font-black tracking-widest text-transparent text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                  {roomCode}
                </h2>
                <div className="mt-6 flex items-center justify-center gap-3 md:justify-start">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500"></span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">
                    Network Status: {roomState?.status || "Waiting"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {roomState?.isHost && (
                  <button
                    onClick={handleStartGame}
                    disabled={loading || (roomState?.players?.length ?? 0) < 2}
                    className="relative overflow-hidden rounded-full border border-cyan-400/50 bg-cyan-500/20 px-10 py-5 text-sm font-black tracking-widest text-cyan-100 uppercase shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all hover:scale-105 hover:bg-cyan-500 hover:text-cyan-950 hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] disabled:scale-100 disabled:opacity-50"
                  >
                    Execute Protocol
                    <div className="absolute -inset-full animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#22d3ee_0%,transparent_50%,transparent_100%)] opacity-20 group-hover:opacity-0" />
                  </button>
                )}
                {!roomState?.isHost && (
                  <div className="rounded-full border border-neutral-700 bg-neutral-800/50 px-8 py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">
                    Awaiting host execution...
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-neutral-900/40 p-8 pt-10 backdrop-blur-md relative">
              <div className="absolute -top-3 left-8 rounded-full border border-neutral-700 bg-neutral-950 px-4 py-1 text-[10px] font-bold tracking-[0.3em] text-neutral-400 uppercase">
                Connected Nodes
              </div>
              <p className="mb-6 mt-2 text-xs font-bold tracking-[0.3em] text-neutral-500 uppercase">
                Capacity: <span className="text-cyan-400">{roomState?.playerCount ?? 0}</span> / {roomState?.maxPlayers ?? 8}
              </p>
              
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(roomState?.players || []).map((p, i) => (
                  <div key={i} className="group flex items-center justify-between rounded-xl border border-white/5 bg-neutral-950/50 p-4 transition-all hover:border-cyan-500/30 hover:bg-neutral-900 hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]">
                    <span className="font-bold tracking-wider text-white uppercase">{p.name || `Subject ${i+1}`}</span>
                    <span className="font-mono text-xs font-medium text-cyan-400 tracking-widest">{p.points} PTS</span>
                  </div>
                ))}
                {(roomState?.players || []).length === 0 && (
                  <p className="col-span-full py-8 text-center text-xs tracking-[0.4em] text-neutral-600 uppercase">
                    Scanning frequencies...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- PHASE: MATCH --- */}
        {phase === "match" && matchState && (
          <div className="mx-auto mt-4 w-full max-w-5xl animate-in fade-in zoom-in-95 duration-700">
            {/* Header Stats */}
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-neutral-900/60 p-4 shadow-lg backdrop-blur-md">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500">Round</span>
                <span className="mt-1 text-3xl font-black tracking-widest text-white">{matchState.currentRound}</span>
                <span className="mt-1 text-[10px] font-medium text-neutral-600 uppercase">OF {matchState.totalRounds}</span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-neutral-900/60 p-4 shadow-lg backdrop-blur-md">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500">Status</span>
                <span className={`mt-2 text-sm font-black uppercase tracking-[0.3em] ${matchState.status === "waiting" ? "text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" : matchState.status === "ongoing" ? "text-cyan-400 animate-pulse drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" : "text-neutral-400"}`}>
                  {matchState.status}
                </span>
              </div>
              <div className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-neutral-900/60 p-4 shadow-lg backdrop-blur-md relative overflow-hidden">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500 z-10 relative">Time Remaining</span>
                {matchState.status === "ongoing" ? (
                  <>
                    <span className={`mt-1 text-4xl font-mono font-black tracking-widest z-10 relative ${countdownSeconds !== null && countdownSeconds <= 3 ? "text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" : "text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]"}`}>
                      00:0{countdownSeconds ?? 0}
                    </span>
                    {countdownSeconds !== null && countdownSeconds <= 3 && (
                       <div className="absolute inset-0 bg-red-500/10 animate-ping" />
                    )}
                  </>
                ) : (
                   <span className="mt-1 text-3xl font-mono font-medium text-neutral-700 tracking-widest z-10 relative">--:--</span>
                )}
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
              {/* Main Arena */}
              <div className="space-y-8 flex flex-col">
                {/* Score VS Board */}
                <div className="relative flex overflow-hidden rounded-3xl border border-white/10 bg-neutral-900/80 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
                  {/* Cyan Glow Background left */}
                  <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-cyan-500/10 blur-[50px] pointer-events-none" />
                  
                  <div className="flex flex-1 flex-col items-center p-10 z-10">
                    <span className="text-[10px] font-bold tracking-[0.4em] text-cyan-500 uppercase">You</span>
                    <span className="mt-4 text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(34,211,238,0.3)]">{matchState.myTotalPoints}</span>
                    <span className="mt-4 text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">Total Score</span>
                  </div>
                  
                  <div className="absolute left-1/2 top-0 flex h-full w-[1px] -translate-x-1/2 items-center justify-center bg-gradient-to-b from-transparent via-white/20 to-transparent">
                    <div className="rounded-full border border-white/10 bg-neutral-950 px-4 py-2 text-xs font-black tracking-[0.3em] text-neutral-400 uppercase shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                      VS
                    </div>
                  </div>

                  {/* Fuchsia Glow Background right */}
                  <div className="absolute -right-20 -bottom-20 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-[50px] pointer-events-none" />

                  <div className="flex flex-1 flex-col items-center p-10 z-10">
                    <span className="text-[10px] font-bold tracking-[0.4em] text-fuchsia-500 uppercase">Opponent</span>
                    <span className="mt-4 text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(217,70,239,0.3)]">{matchState.opponentTotalPoints}</span>
                    <span className="mt-4 text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">Total Score</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex-1 rounded-3xl border border-white/5 bg-neutral-900/60 p-8 backdrop-blur-xl text-center shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-cyan-500 opacity-20" />
                  
                  {matchState.status === "waiting" ? (
                    <div className="flex h-full flex-col items-center justify-center py-12">
                      <p className="mb-8 text-sm font-bold tracking-[0.2em] text-neutral-400 uppercase">
                        The grid is locked. Confirm readiness.
                      </p>
                      <button
                        onClick={handleReady}
                        disabled={loading}
                        className="relative overflow-hidden rounded-2xl border border-amber-500/50 bg-amber-500/10 px-16 py-6 text-sm font-black tracking-[0.3em] text-amber-400 uppercase shadow-[0_0_30px_rgba(245,158,11,0.15)] transition-all hover:bg-amber-500 hover:text-neutral-950 hover:shadow-[0_0_50px_rgba(245,158,11,0.5)] hover:scale-105 disabled:opacity-50 disabled:scale-100"
                      >
                        Initialize
                      </button>
                    </div>
                  ) : matchState.status === "completed" ? (
                    <div className="flex h-full flex-col items-center justify-center py-12 space-y-8">
                      <h3 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400 uppercase tracking-widest drop-shadow-[0_0_20px_rgba(248,113,113,0.5)]">
                        Match Concluded
                      </h3>
                      <button
                        onClick={() => setPhase("lobby")}
                        className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-12 py-4 text-sm font-bold tracking-widest text-cyan-400 uppercase shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all hover:bg-cyan-500 hover:text-neutral-950 hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:scale-105"
                      >
                        Return to Hub
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col justify-center space-y-8">
                      <p className="text-[10px] font-bold tracking-[0.4em] text-neutral-500 uppercase">
                        Select Directive
                      </p>
                      
                      {selectedChoice ? (
                        <div className="py-12 relative">
                          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full blur-[80px] pointer-events-none ${selectedChoice === 'cooperate' ? 'bg-cyan-500/20' : 'bg-fuchsia-500/20'}`} />
                          
                          <p className="text-3xl font-black tracking-[0.2em] text-white uppercase drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] relative z-10">
                            Locked: <br/> 
                            <span className={`mt-4 inline-block ${selectedChoice === "cooperate" ? "text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]" : "text-fuchsia-400 drop-shadow-[0_0_15px_rgba(217,70,239,0.6)]"}`}>
                              {selectedChoice}
                            </span>
                          </p>
                          <p className="mt-8 text-[10px] font-bold text-neutral-500 animate-[pulse_2s_ease-in-out_infinite] uppercase tracking-[0.3em] relative z-10">
                            Awaiting Opponent Link...
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-6">
                          <button
                            onClick={() => handleChoice("cooperate")}
                            disabled={loading || !!matchState.myChoice}
                            className="group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-10 pt-12 shadow-[0_0_30px_rgba(34,211,238,0.05)] transition-all hover:-translate-y-1 hover:bg-cyan-500/20 hover:shadow-[0_10px_40px_rgba(34,211,238,0.3)] hover:border-cyan-400 disabled:opacity-50 disabled:hover:translate-y-0"
                          >
                            <span className="text-2xl font-black tracking-[0.25em] text-cyan-300 uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] group-hover:text-white transition-colors">
                              Cooperate
                            </span>
                            <span className="mt-3 text-[10px] font-bold uppercase tracking-widest text-cyan-500/70 group-hover:text-cyan-400">Mutual Survival</span>
                            <div className="absolute top-0 w-[150%] h-[150%] left-[-25%] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.15),transparent_60%)] pointer-events-none" />
                            <div className="absolute bottom-0 h-1 w-full bg-cyan-400 scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
                          </button>
                          
                          <button
                            onClick={() => handleChoice("betray")}
                            disabled={loading || !!matchState.myChoice}
                            className="group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-10 pt-12 shadow-[0_0_30px_rgba(217,70,239,0.05)] transition-all hover:-translate-y-1 hover:bg-fuchsia-500/20 hover:shadow-[0_10px_40px_rgba(217,70,239,0.3)] hover:border-fuchsia-400 disabled:opacity-50 disabled:hover:translate-y-0"
                          >
                            <span className="text-2xl font-black tracking-[0.25em] text-fuchsia-300 uppercase drop-shadow-[0_0_10px_rgba(217,70,239,0.5)] group-hover:text-white transition-colors">
                              Betray
                            </span>
                            <span className="mt-3 text-[10px] font-bold uppercase tracking-widest text-fuchsia-500/70 group-hover:text-fuchsia-400">Secure Advantage</span>
                            <div className="absolute top-0 w-[150%] h-[150%] left-[-25%] bg-[radial-gradient(circle_at_50%_0%,rgba(217,70,239,0.15),transparent_60%)] pointer-events-none" />
                            <div className="absolute bottom-0 h-1 w-full bg-fuchsia-400 scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar: History */}
              <div className="flex max-h-[700px] flex-col overflow-hidden rounded-3xl border border-white/5 bg-neutral-900/60 shadow-2xl backdrop-blur-2xl">
                <div className="border-b border-white/5 bg-neutral-950/80 p-6 flex justify-center sticky top-0 z-10">
                  <h3 className="text-[10px] font-bold tracking-[0.3em] text-neutral-500 uppercase">Audit Log</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono scrollbar-hide shrink-0">
                  {(matchState.rounds || []).length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-center text-[10px] tracking-[0.4em] text-neutral-600 uppercase">No records found</p>
                    </div>
                  ) : (
                    [...matchState.rounds].reverse().map((round) => (
                      <div key={round.roundNumber} className="relative rounded-2xl border border-white/5 bg-neutral-950/80 p-5 mt-4 transition-all hover:border-white/10 hover:bg-neutral-950 group">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-neutral-800 border border-neutral-700 px-3 py-1 text-[9px] font-black text-white uppercase tracking-[0.3em] shadow-[0_0_10px_rgba(0,0,0,0.5)] group-hover:border-cyan-500/50 group-hover:text-cyan-300 transition-colors">
                          R {round.roundNumber}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-6 relative">
                           {/* Divider inside row */}
                          <div className="absolute left-1/2 top-1/2 h-4/5 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-white/5" />
                          
                          <div className="flex flex-col items-center">
                            <p className="text-[9px] text-neutral-600 uppercase tracking-widest font-sans font-bold mb-2">You</p>
                            <div className={`flex items-center justify-center w-full rounded py-1 ${round.player1Choice === 'cooperate' ? 'bg-cyan-500/10' : 'bg-fuchsia-500/10'}`}>
                               <p className={`text-[10px] font-black uppercase tracking-wider ${round.player1Choice === 'cooperate' ? 'text-cyan-400' : 'text-fuchsia-400'}`}>
                                 {round.player1Choice === 'cooperate' ? 'CO-OP' : 'BETRAY'}
                               </p>
                            </div>
                            <p className="mt-2 text-sm text-white font-bold">+{round.player1Points}</p>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <p className="text-[9px] text-neutral-600 uppercase tracking-widest font-sans font-bold mb-2">Enemy</p>
                            <div className={`flex items-center justify-center w-full rounded py-1 ${round.player2Choice === 'cooperate' ? 'bg-cyan-500/10' : 'bg-fuchsia-500/10'}`}>
                               <p className={`text-[10px] font-black uppercase tracking-wider ${round.player2Choice === 'cooperate' ? 'text-cyan-400' : 'text-fuchsia-400'}`}>
                                 {round.player2Choice === 'cooperate' ? 'CO-OP' : 'BETRAY'}
                               </p>
                            </div>
                            <p className="mt-2 text-sm text-white font-bold">+{round.player2Points}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {showLeaveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-[92%] max-w-md rounded-2xl border border-fuchsia-400/40 bg-neutral-900/95 p-6 shadow-[0_0_40px_rgba(217,70,239,0.25)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-fuchsia-300">Warning</p>
              <h3 className="mt-2 text-xl font-black text-white">Leave current game?</h3>
              <p className="mt-2 text-sm text-neutral-300">
                Your current room/match session will be cleared. You can still rejoin later with room code if it is active.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800/80 px-4 py-2 text-sm font-bold uppercase tracking-wider text-neutral-200 transition hover:border-neutral-500"
                >
                  Stay
                </button>
                <button
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    clearSession();
                  }}
                  className="flex-1 rounded-xl border border-red-500/60 bg-red-500/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500/25"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
    )
  );
}
