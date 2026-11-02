/**
 * Single shared simulation session for the whole app. Mounted once in the root
 * route so Kids Mode, Engineering Mode and the landing screen all read and write
 * the same ReactorState — switching modes never restarts the simulation.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { applyCommand, CommandError, historyPoint, initialState, stepSimulation, systemStatus, TIMESTEP_SECONDS, withEvent, type Command, type CommandSource, type HistoryPoint, type ReactorState, type RunMode } from "./simulator";
import { HilSerialLink, initialHilStatus, truthy, type HilInput, type HilStatus } from "./hil-serial";

export type AchievementId = "explorer" | "steam" | "energy" | "turbine" | "science";
export const ACHIEVEMENTS: { id: AchievementId; title: string; how: string }[] = [
  { id: "explorer", title: "First Reactor Explorer", how: "Tap your first part of the power plant." },
  { id: "steam", title: "Steam Scientist", how: "Make lots of steam in “How does steam work?”." },
  { id: "energy", title: "Energy Expert", how: "Make plenty of electricity in “Make electricity”." },
  { id: "turbine", title: "Turbine Master", how: "Stop the turbine, start it again and get it spinning fast." },
  { id: "science", title: "Nuclear Science Explorer", how: "Answer every quiz question correctly." },
];

interface KidsProgress {
  discovered: string[];
  achievements: AchievementId[];
  turbineRestarted: boolean;
}

interface SimulationContextValue {
  state: ReactorState;
  history: HistoryPoint[];
  dispatch: (command: Command, source?: CommandSource) => void;
  setMode: (mode: RunMode) => void;
  runDemo: () => void;
  stopDemo: () => void;
  exportCsv: (kind: "trends" | "events") => void;
  hil: { status: HilStatus; heartbeatAgeMs: number | null; connect: (baud: number) => void; disconnect: () => void };
  kids: KidsProgress & { discover: (id: string) => void; unlock: (id: AchievementId) => void; markTurbineRestart: () => void };
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReactorState>(initialState);
  const [history, setHistory] = useState<HistoryPoint[]>(() => [historyPoint(initialState())]);
  const [hilStatus, setHilStatus] = useState<HilStatus>(initialHilStatus);
  const [now, setNow] = useState(() => Date.now());
  const [kids, setKids] = useState<KidsProgress>({ discovered: [], achievements: [], turbineRestarted: false });
  const stateRef = useRef(state);
  stateRef.current = state;
  const demoStart = useRef<number | null>(null);
  const lastSample = useRef(0);
  const linkRef = useRef<HilSerialLink | null>(null);
  const lastHilInput = useRef<HilInput>({});

  const dispatch = useCallback((command: Command, source: CommandSource = "OPERATOR") => {
    setState((s) => {
      try {
        return applyCommand(s, command, source);
      } catch (error) {
        if (error instanceof CommandError) {
          toast.warning(error.message, { id: error.message });
          return withEvent(s, "ERROR", `Rejected ${source.toLowerCase()} command — ${error.message}`);
        }
        throw error;
      }
    });
  }, []);

  // Fixed-timestep clock, independent of wall-clock rendering.
  useEffect(() => {
    const timer = window.setInterval(() => setState((s) => stepSimulation(s, TIMESTEP_SECONDS)), TIMESTEP_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Trend sampling every 0.5 s of simulation time.
  useEffect(() => {
    if (state.time < lastSample.current) { lastSample.current = state.time; setHistory([historyPoint(state)]); return; }
    if (state.time - lastSample.current >= 0.5) {
      lastSample.current = state.time;
      setHistory((points) => [...points, historyPoint(state)].slice(-3600));
    }
  }, [state]);

  // Scripted capstone demonstration (runs on the same engine via commands).
  useEffect(() => {
    if (!state.demoRunning || demoStart.current === null) return;
    const t = state.time - demoStart.current;
    const run = (cmd: Command) => setState((s) => { try { return applyCommand(s, cmd, "SYSTEM"); } catch { return s; } });
    const at = (sec: number) => t >= sec && t < sec + 0.25 * state.speed + 0.01;
    if (at(6)) run({ type: "setRod", value: 45 });
    if (at(26)) run({ type: "setFault", fault: "sensorDrift", on: true });
    if (at(40)) run({ type: "setFault", fault: "turbineTrip", on: true });
    if (at(54)) run({ type: "scram", reason: "Demo: protective action after turbine trip" });
    if (t >= 76) { demoStart.current = state.time; setState((s) => withEvent({ ...applyCommand(s, { type: "loadScenario", name: "STARTUP" }, "SYSTEM"), demoRunning: true, speed: 2 }, "SYSTEM", "Demo: recovery and restart")); }
  }, [state.time, state.demoRunning, state.speed]);

  const runDemo = useCallback(() => {
    setState((s) => {
      demoStart.current = s.time;
      return withEvent({ ...applyCommand(s, { type: "loadScenario", name: "STARTUP" }, "SYSTEM"), demoRunning: true, speed: 2, paused: false }, "SYSTEM", "Capstone demonstration started (startup → power change → sensor fault → turbine trip → SCRAM → recovery)");
    });
  }, []);
  const stopDemo = useCallback(() => { demoStart.current = null; setState((s) => withEvent({ ...s, demoRunning: false }, "SYSTEM", "Demonstration stopped")); }, []);

  const setMode = useCallback((mode: RunMode) => {
    setState((s) => (s.mode === mode ? s : withEvent({ ...s, mode }, "SYSTEM", `Interface switched to ${mode === "kids" ? "Kids Mode" : "Engineering Mode"} — session preserved`)));
  }, []);

  // ── HIL link ──
  const handleHilInput = useCallback((input: HilInput) => {
    if (stateRef.current.faults.communicationFailure) return; // simulated link loss: frames ignored
    const prev = lastHilInput.current;
    lastHilInput.current = { ...prev, ...input };
    if (input.rod !== undefined && (prev.rod === undefined || Math.abs(input.rod - prev.rod) >= 1) && !stateRef.current.scram) dispatch({ type: "setRod", value: input.rod }, "HIL");
    if (input.valve !== undefined && (prev.valve === undefined || Math.abs(input.valve - prev.valve) >= 1)) dispatch({ type: "setValve", value: input.valve }, "HIL");
    if (truthy(input.scram) && !truthy(prev.scram)) dispatch({ type: "scram", reason: "Physical SCRAM button pressed" }, "HIL");
    if (input.pumpA !== undefined && truthy(input.pumpA) !== truthy(prev.pumpA)) dispatch({ type: "setPump", pump: "A", on: truthy(input.pumpA) }, "HIL");
    if (input.pumpB !== undefined && truthy(input.pumpB) !== truthy(prev.pumpB)) dispatch({ type: "setPump", pump: "B", on: truthy(input.pumpB) }, "HIL");
    if (input.turbine !== undefined && truthy(input.turbine) !== truthy(prev.turbine)) dispatch({ type: "setTurbine", on: truthy(input.turbine) }, "HIL");
  }, [dispatch]);

  useEffect(() => {
    const link = new HilSerialLink(
      (s) => {
        setHilStatus(s);
        setState((st) => { const mode = s.connected ? "hil" : "software"; return st.hilMode === mode ? st : { ...st, hilMode: mode }; });
      },
      handleHilInput,
      (message) => setState((s) => withEvent(s, "HIL", message)),
    );
    linkRef.current = link;
    return () => { void link.disconnect("Page closed"); };
  }, [handleHilInput]);

  // Transmit state frames at 2 Hz and refresh heartbeat age.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      const s = stateRef.current;
      if (!linkRef.current || s.faults.communicationFailure) return;
      void linkRef.current.send({ t: Number(s.time.toFixed(1)), pwr: Number(s.powerPercent.toFixed(1)), rod: Number(s.actualRod.toFixed(1)), tc: Number(s.coreTemperature.toFixed(1)), p: Number(s.pressure.toFixed(2)), lvl: Number(s.waterLevel.toFixed(1)), rpm: Math.round(s.turbineRpm), mwe: Number(s.electricalOutput.toFixed(1)), scram: s.scram ? 1 : 0, alarm: s.alarms.some((a) => !a.acknowledged) ? 1 : 0, status: systemStatus(s) });
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const exportCsv = useCallback((kind: "trends" | "events") => {
    const s = stateRef.current;
    let csv: string;
    if (kind === "trends") {
      const headers = Object.keys(historyPoint(s)) as (keyof HistoryPoint)[];
      csv = [headers.join(","), ...history.map((p) => headers.map((k) => p[k].toFixed(3)).join(","))].join("\n");
    } else {
      csv = ["sim_time_s,type,message", ...[...s.events].reverse().map((e) => `${e.time.toFixed(1)},${e.type},"${e.message.replace(/"/g, '""')}"`)].join("\n");
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `nucleus-${kind}-${Math.floor(s.time)}s.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setState((st) => withEvent(st, "SYSTEM", `${kind === "trends" ? "Trend data" : "Event log"} exported as CSV`));
  }, [history]);

  const heartbeatAgeMs = hilStatus.connected && hilStatus.lastRxAt ? now - hilStatus.lastRxAt : null;

  const value = useMemo<SimulationContextValue>(() => ({
    state, history, dispatch, setMode, runDemo, stopDemo, exportCsv,
    hil: { status: hilStatus, heartbeatAgeMs, connect: (baud) => void linkRef.current?.connect(baud), disconnect: () => void linkRef.current?.disconnect() },
    kids: {
      ...kids,
      discover: (id) => setKids((k) => (k.discovered.includes(id) ? k : { ...k, discovered: [...k.discovered, id], achievements: k.achievements.includes("explorer") ? k.achievements : [...k.achievements, "explorer"] })),
      unlock: (id) => setKids((k) => (k.achievements.includes(id) ? k : { ...k, achievements: [...k.achievements, id] })),
      markTurbineRestart: () => setKids((k) => ({ ...k, turbineRestarted: true })),
    },
  }), [state, history, dispatch, setMode, runDemo, stopDemo, exportCsv, hilStatus, heartbeatAgeMs, kids]);

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation must be used inside SimulationProvider");
  return ctx;
}
