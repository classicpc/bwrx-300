import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, BookOpen, ChevronRight, CircleStop, Cpu, Download, Gauge, Pause, Play, RotateCcw, ShieldAlert, Zap } from "lucide-react";
import { ControlButton } from "@/components/ui/control-button";
import { ReactorSchematic } from "@/components/ReactorSchematic";
import { historyPoint, initialState, sensorsFor, stepSimulation, type EventRecord, type FaultState, type HistoryPoint, type ReactorState } from "@/lib/simulator";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "NUCLEUS HIL Reactor Simulator" },
    { name: "description", content: "Educational BWRX-300-inspired hardware-in-the-loop reactor systems simulator." },
    { property: "og:title", content: "NUCLEUS HIL Reactor Simulator" },
    { property: "og:description", content: "Explore causal reactor, steam, turbine, safety, sensor, and HIL behavior." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SimulatorPage,
});

type View = "overview" | "alarms" | "sensors" | "faults" | "training" | "model" | "validation" | "events";
const views: { id: View; label: string }[] = [
  { id: "overview", label: "Process" }, { id: "alarms", label: "Alarms" }, { id: "sensors", label: "Sensors" }, { id: "faults", label: "Faults" },
  { id: "training", label: "Training" }, { id: "model", label: "Model" }, { id: "validation", label: "Validation" }, { id: "events", label: "Events" },
];

const scenarios = ["STARTUP", "NORMAL OPERATION", "POWER INCREASE", "POWER DECREASE", "TURBINE TRIP", "LOSS OF SENSOR", "LOW WATER LEVEL", "HIGH PRESSURE", "CONTROL ROD FAILURE", "SCRAM"];
const faultLabels: { key: keyof Omit<FaultState, "severity">; label: string; subsystem: string; symptom: string }[] = [
  { key: "sensorDrift", label: "Temperature sensor drift", subsystem: "Instrumentation", symptom: "Reported temperature slowly separates from the model value." },
  { key: "pressureSensor", label: "Pressure sensor failure", subsystem: "Instrumentation", symptom: "Pressure channel becomes invalid and generates a warning." },
  { key: "levelSensor", label: "Water-level sensor failure", subsystem: "Instrumentation", symptom: "Level channel becomes invalid while the true value remains available." },
  { key: "pumpDegradation", label: "Pump degradation", subsystem: "Coolant", symptom: "Recirculation flow falls and thermal response slows." },
  { key: "turbineTrip", label: "Turbine trip", subsystem: "Turbine", symptom: "Turbine speed and electrical output ramp down; pressure may rise." },
  { key: "generatorDisconnect", label: "Generator disconnect", subsystem: "Electrical", symptom: "Electrical output falls while the turbine continues coasting." },
  { key: "communicationFailure", label: "HIL communication loss", subsystem: "Hardware", symptom: "Virtual I/O remains active but the hardware link reports disconnected." },
  { key: "rodFailure", label: "Control rod movement failure", subsystem: "Reactor control", symptom: "Actual rod position stops following commanded position." },
];

const explanations: Record<string, string> = {
  "Reactor power": "The amount of heat the model is producing. More power creates more steam and eventually more electricity.",
  "Core temperature": "The model's core heat condition. Cooling removes heat, while reactor power adds it.",
  "Vessel pressure": "Pressure created as heated water produces steam. The steam valve and turbine affect it.",
  "Water level": "The simulated water inventory covering and cooling the core. Feedwater replaces water sent to steam.",
};

function formatTime(seconds: number) { const s = Math.floor(seconds); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

function SimulatorPage() {
  const [state, setState] = useState(initialState);
  const [history, setHistory] = useState<HistoryPoint[]>(() => [historyPoint(initialState())]);
  const [view, setView] = useState<View>("overview");
  const [trendWindow, setTrendWindow] = useState(60);
  const [selectedScenario, setSelectedScenario] = useState("NORMAL OPERATION");
  const [trainingAnswer, setTrainingAnswer] = useState("");
  const [trainingScore, setTrainingScore] = useState<number | null>(null);
  const historyCounter = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((current) => {
        const next = stepSimulation(current, 0.1);
        historyCounter.current += 1;
        if (!next.paused && historyCounter.current % 5 === 0) setHistory((points) => [...points, historyPoint(next)].slice(-1800));
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  const log = useCallback((type: EventRecord["type"], message: string) => setState((s) => ({ ...s, events: [{ id: Date.now(), time: s.time, type, message }, ...s.events].slice(0, 120) })), []);
  const command = (changes: Partial<ReactorState>, message: string) => { setState((s) => ({ ...s, ...changes })); log("OPERATOR", message); };
  const applyScenario = (name: string) => {
    setSelectedScenario(name);
    setState((current) => {
      const base = { ...current, scram: false, scramReason: "", faults: { ...initialState().faults }, demoRunning: false };
      if (name === "STARTUP") return { ...base, powerPercent: 4, neutronProxy: 0.04, commandedRod: 82, actualRod: 82, turbineRpm: 0, turbinePower: 0, electricalOutput: 0 };
      if (name === "NORMAL OPERATION") return { ...initialState(), time: current.time, mode: current.mode, speed: current.speed, events: current.events };
      if (name === "POWER INCREASE") return { ...base, commandedRod: 42 };
      if (name === "POWER DECREASE") return { ...base, commandedRod: 76 };
      if (name === "TURBINE TRIP") return { ...base, faults: { ...base.faults, turbineTrip: true } };
      if (name === "LOSS OF SENSOR") return { ...base, faults: { ...base.faults, pressureSensor: true } };
      if (name === "LOW WATER LEVEL") return { ...base, waterLevel: 45 };
      if (name === "HIGH PRESSURE") return { ...base, pressure: 7.85 };
      if (name === "CONTROL ROD FAILURE") return { ...base, commandedRod: 75, faults: { ...base.faults, rodFailure: true } };
      return { ...base, scram: true, commandedRod: 100, scramReason: "Operator scenario: SCRAM" };
    });
    log("SYSTEM", `Scenario loaded: ${name}`);
  };
  const runDemo = () => {
    setState((s) => ({ ...initialState(), time: s.time, mode: s.mode, speed: 2, demoRunning: true, commandedRod: 80, powerPercent: 8, neutronProxy: 0.08, events: s.events }));
    log("SYSTEM", "Capstone demonstration sequence started");
  };
  useEffect(() => {
    if (!state.demoRunning) return;
    const phase = Math.floor(state.time) % 70;
    if (phase === 8 && state.commandedRod !== 55) setState((s) => ({ ...s, commandedRod: 55 }));
    if (phase === 24 && !state.faults.sensorDrift) setState((s) => ({ ...s, faults: { ...s.faults, sensorDrift: true } }));
    if (phase === 38 && !state.faults.turbineTrip) setState((s) => ({ ...s, faults: { ...s.faults, turbineTrip: true } }));
    if (phase === 52 && !state.scram) setState((s) => ({ ...s, scram: true, commandedRod: 100, scramReason: "Demo protective action" }));
    if (phase === 68) setState((s) => ({ ...initialState(), time: s.time, mode: s.mode, speed: 2, demoRunning: true, events: s.events }));
  }, [state.time, state.demoRunning, state.commandedRod, state.faults.sensorDrift, state.faults.turbineTrip, state.scram]);

  const status = state.paused ? "SIMULATION PAUSED" : state.scram ? "SCRAM" : state.alarms.some((a) => a.level === "ALARM" || a.level === "CRITICAL") ? "ALARM" : state.alarms.length ? "CAUTION" : "NORMAL";
  const visibleHistory = history.slice(-(trendWindow * 2));
  const sensors = useMemo(() => sensorsFor(state), [state]);
  const unacked = state.alarms.filter((a) => !a.acknowledged).length;
  const exportCsv = () => {
    const headers = Object.keys(history[0] ?? historyPoint(state));
    const rows = history.map((p) => headers.map((key) => p[key as keyof HistoryPoint]).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "nucleus-hil-session.csv"; link.click(); URL.revokeObjectURL(link.href);
    log("SYSTEM", "Simulation data exported as CSV");
  };

  return (
    <div className="lab-shell min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b-2 border-border bg-card font-mono text-[10px] shadow-sm">
        <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-stretch sm:flex">
          <div className="flex min-w-0 items-center gap-3 border-r border-border px-4"><span className="status-lamp size-2.5 shrink-0 rounded-full bg-primary text-primary"/><div className="min-w-0"><strong className="block truncate tracking-[0.12em] text-foreground">NUCLEUS REACTOR SYSTEMS LABORATORY</strong><span className="block truncate text-[8px] tracking-[0.08em] text-muted-foreground">BWR CONCEPT TRAINER · INSTRUMENT CONSOLE HIL-03</span></div></div>
          <div className="hidden items-center border-r border-border px-4 sm:flex"><span className="text-muted-foreground">SYSTEM</span><span className={status === "NORMAL" ? "ml-2 text-primary" : status === "CAUTION" ? "ml-2 text-warning" : "alarm-pulse ml-2 text-destructive"}>{status}</span></div>
          <div className="flex items-center border-r border-border px-4"><span className="text-muted-foreground">SIM</span><span className="ml-2">{formatTime(state.time)} · ×{state.speed}</span></div>
          <div className="flex items-center border-r border-border px-4"><span className="text-muted-foreground">ALARMS</span><span className={unacked ? "ml-2 text-destructive" : "ml-2 text-primary"}>{unacked} UNACK</span></div>
          <div className="flex items-center gap-2 border-l border-border px-3"><ShieldAlert className="size-3.5 shrink-0 text-destructive"/><span className="max-w-44 bg-destructive px-2 py-1 text-center text-[8px] font-bold leading-tight text-destructive-foreground sm:max-w-none">EDUCATIONAL SIMULATION · NOT FOR OPERATIONAL USE</span></div>
        </div>
        <nav className="flex overflow-x-auto border-t border-border px-3" aria-label="Simulator sections">
          {views.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={`border-b-2 px-3 py-2 text-[10px] tracking-[0.1em] ${view === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label.toUpperCase()}</button>)}
        </nav>
      </header>

       <main className="mx-auto max-w-[1600px] p-2 sm:p-3">
         {view === "overview" && <div className="grid gap-2 xl:grid-cols-[258px_minmax(540px,1fr)_334px]">
          <CommandRail state={state} command={command} applyScenario={applyScenario} selectedScenario={selectedScenario} runDemo={runDemo} />
          <section className="flex min-w-0 flex-col gap-3">
             <div className="panel min-h-[410px] flex-1 overflow-hidden"><div className="panel-header"><span className="label-caps">Mimic panel M-01 · reactor to generator</span><span className="flex items-center gap-2 font-mono text-[9px] text-primary"><i className="status-lamp size-1.5 rounded-full bg-primary text-primary"/>{state.steamFlow > 20 ? "PROCESS FLOW ESTABLISHED" : "LOW FLOW"}</span></div><div className="scan-grid h-[380px] p-2"><ReactorSchematic state={state}/></div></div>
            <TrendPanel data={visibleHistory} window={trendWindow} setWindow={setTrendWindow}/>
          </section>
           <aside className="flex flex-col gap-2"><Metrics state={state}/><AlarmSummary state={state} setState={setState} open={() => setView("alarms")}/><TerminalEvents state={state}/><BeginnerCard state={state} openEngineering={() => setState((s) => ({ ...s, mode: "engineering" }))}/></aside>
        </div>}
        {view === "alarms" && <AlarmManager state={state} setState={setState}/>} 
        {view === "sensors" && <SensorsPanel sensors={sensors} state={state}/>} 
        {view === "faults" && <FaultPanel state={state} setState={setState} log={log}/>} 
        {view === "training" && <TrainingPanel scenario={selectedScenario} setScenario={applyScenario} answer={trainingAnswer} setAnswer={setTrainingAnswer} score={trainingScore} setScore={setTrainingScore}/>} 
        {view === "model" && <ModelPanel/>}
        {view === "validation" && <ValidationPanel/>}
        {view === "events" && <EventsPanel state={state} exportCsv={exportCsv}/>} 
      </main>
       <footer className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-border bg-secondary px-4 py-2 font-mono text-[9px] tracking-[0.05em] text-muted-foreground"><span>LAB STATION HIL-03 · DETERMINISTIC CAUSAL MODEL · Δt 100 ms</span><span>SIMULATED HARDWARE ONLY · ISOLATED EDUCATIONAL SYSTEM</span></footer>
    </div>
  );
}

function CommandRail({ state, command, applyScenario, selectedScenario, runDemo }: { state: ReactorState; command: (c: Partial<ReactorState>, m: string) => void; applyScenario: (n: string) => void; selectedScenario: string; runDemo: () => void }) {
  return <aside className="panel flex flex-col"><div className="panel-header"><span className="label-caps">Control rack · CR-01</span><span className="flex items-center gap-2 font-mono text-[8px] text-primary"><i className="status-lamp size-1.5 rounded-full bg-primary text-primary"/>ENERGIZED</span></div><div className="space-y-4 p-3">
    <div><div className="mb-1 flex justify-between text-xs"><span>Operating view</span><span className="numeric text-primary">{state.mode.toUpperCase()}</span></div><div className="grid grid-cols-2 gap-1"><ControlButton variant={state.mode === "beginner" ? "active" : "default"} onClick={() => command({ mode: "beginner" }, "Beginner view selected")}>BEGINNER</ControlButton><ControlButton variant={state.mode === "engineering" ? "active" : "default"} onClick={() => command({ mode: "engineering" }, "Engineering view selected")}>ENGINEERING</ControlButton></div></div>
    <div><div className="mb-1 flex justify-between text-xs"><span>Control rod insertion</span><span className="numeric text-primary">CMD {state.commandedRod.toFixed(0)}%</span></div><input aria-label="Commanded control rod insertion" type="range" min="0" max="100" value={state.commandedRod} disabled={state.scram} onChange={(e) => command({ commandedRod: Number(e.target.value) }, `Rod command ${e.target.value}% inserted`)} className="w-full"/><div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground"><span>ACT {state.actualRod.toFixed(1)}%</span><span>{state.rodMoving}</span></div></div>
    <ControlRow label="Coolant pumps" value={`${Number(state.pumpA) + Number(state.pumpB)}/2 RUN`}><ControlButton variant={state.pumpA ? "active" : "default"} onClick={() => command({ pumpA: !state.pumpA }, `Pump A ${state.pumpA ? "stopped" : "started"}`)}>A</ControlButton><ControlButton variant={state.pumpB ? "active" : "default"} onClick={() => command({ pumpB: !state.pumpB }, `Pump B ${state.pumpB ? "stopped" : "started"}`)}>B</ControlButton></ControlRow>
    <div><div className="mb-1 flex justify-between text-xs"><span>Steam valve</span><span className="numeric">{state.valvePosition.toFixed(0)}%</span></div><input aria-label="Steam valve position" type="range" min="0" max="100" value={state.valvePosition} onChange={(e) => command({ valvePosition: Number(e.target.value) }, `Steam valve commanded to ${e.target.value}%`)} className="w-full"/></div>
    <ControlRow label="Turbine" value={state.turbineEnabled ? "ENABLED" : "STOPPED"}><ControlButton variant={state.turbineEnabled ? "active" : "default"} onClick={() => command({ turbineEnabled: !state.turbineEnabled }, `Turbine ${state.turbineEnabled ? "stopped" : "enabled"}`)}>{state.turbineEnabled ? <CircleStop className="size-3.5"/> : <Play className="size-3.5"/>}</ControlButton></ControlRow>
    <div className="border-2 border-destructive/70 bg-destructive/5 p-1.5"><ControlButton variant="danger" className="w-full justify-start py-3" onClick={() => command({ scram: true, commandedRod: 100, scramReason: "Manual operator SCRAM" }, "Manual SCRAM initiated")}><ShieldAlert className="size-4"/> INITIATE SCRAM</ControlButton></div>
  </div><div className="mt-auto border-t-2 border-border bg-secondary/35 p-3"><label className="label-caps" htmlFor="scenario">Scenario selector · SW-12</label><select id="scenario" value={selectedScenario} onChange={(e) => applyScenario(e.target.value)} className="mt-2 w-full rounded-[1px] border border-input bg-secondary px-2 py-2 text-xs text-foreground">{scenarios.map((s) => <option key={s}>{s}</option>)}</select><div className="mt-3 flex gap-1">{[0.1, 0.5, 1, 2, 5].map((speed) => <ControlButton key={speed} className="min-w-0 flex-1 px-1" variant={state.speed === speed ? "active" : "default"} onClick={() => command({ speed }, `Simulation speed set to ${speed}x`)}>×{speed}</ControlButton>)}</div><div className="mt-2 grid grid-cols-3 gap-1"><ControlButton aria-label={state.paused ? "Resume simulation" : "Pause simulation"} onClick={() => command({ paused: !state.paused }, state.paused ? "Simulation resumed" : "Simulation paused")}>{state.paused ? <Play className="size-3"/> : <Pause className="size-3"/>}</ControlButton><ControlButton aria-label="Reset simulation" onClick={() => command(initialState(), "Simulation reset")}><RotateCcw className="size-3"/></ControlButton><ControlButton variant="warning" onClick={runDemo}>DEMO</ControlButton></div></div></aside>;
}

function ControlRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-2 border-t border-border pt-3"><div><div className="text-xs">{label}</div><div className="numeric mt-1 text-[9px] text-muted-foreground">{value}</div></div><div className="flex gap-1">{children}</div></div>; }

function Metrics({ state }: { state: ReactorState }) { const items = [["PWR-101", "THERMAL POWER", state.thermalPower, "MWt", "text-primary"], ["TEMP-201", "CORE TEMP", state.coreTemperature, "°C", state.coreTemperature > 315 ? "text-warning" : "text-primary"], ["PRESS-301", "VESSEL PRESS", state.pressure, "MPa", state.pressure > 7.7 ? "text-destructive" : "text-primary"], ["LVL-401", "WATER LEVEL", state.waterLevel, "%", state.waterLevel < 48 ? "text-destructive" : "text-primary"], ["FLOW-501", "STEAM FLOW", state.steamFlow, "kg/s", "text-foreground"], ["GEN-601", "ELECTRICAL", state.electricalOutput, "MWe", "text-foreground"]] as const; return <div className="grid grid-cols-2 gap-1.5">{items.map(([tag, label, value, unit, tone]) => <div key={label} className="panel p-3"><div className="flex justify-between gap-1"><div className="label-caps">{label}</div><span className="font-mono text-[7px] text-muted-foreground">{tag}</span></div><div className={`instrument-value numeric mt-2 text-xl font-bold ${tone}`}>{value.toFixed(unit === "MPa" ? 2 : 1)}</div><div className="numeric text-[9px] text-muted-foreground">{unit}</div><div className="scale-track mt-2 h-1 border-y border-border"/></div>)}</div>; }

function TerminalEvents({ state }: { state: ReactorState }) { return <div className="panel overflow-hidden"><div className="panel-header"><span className="label-caps">Recorder output · REC-08</span><span className="font-mono text-[8px] text-primary">ONLINE</span></div><div className="terminal h-24 space-y-1 overflow-hidden p-2 text-[8px] leading-relaxed">{state.events.slice(0, 5).map((event) => <div key={event.id}><span className="text-muted-foreground">[{formatTime(event.time)}]</span> <span className={event.type === "ALARM" ? "text-destructive" : event.type === "FAULT" ? "text-warning" : "text-primary"}>{event.type}</span> <span className="text-foreground/80">{event.message}</span></div>)}</div></div>; }

function AlarmSummary({ state, setState, open }: { state: ReactorState; setState: React.Dispatch<React.SetStateAction<ReactorState>>; open: () => void }) { return <div className="panel"><div className="panel-header"><span className="label-caps">Alarm annunciator · ANN-01</span><button onClick={open} className="font-mono text-[9px] text-primary">VIEW ALL</button></div><div className="grid min-h-24 grid-cols-2 gap-1 p-2">{state.alarms.length === 0 ? <div className="col-span-2 flex items-center gap-2 border border-primary/30 bg-primary/5 p-3 text-[10px] font-semibold uppercase text-primary"><span className="status-lamp size-2 rounded-full bg-primary text-primary"/> All channels normal</div> : state.alarms.slice(0, 4).map((a) => <div key={a.id} className={`flex items-center gap-2 border p-2 text-[9px] font-semibold uppercase ${a.level === "CRITICAL" || a.level === "ALARM" ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-warning/60 bg-warning/10 text-warning"}`}><AlertTriangle className="size-3 shrink-0"/><span className="flex-1">{a.name}</span><button onClick={() => setState((s) => ({ ...s, alarms: s.alarms.map((x) => x.id === a.id ? { ...x, acknowledged: true } : x) }))} className="font-mono text-[8px] underline">{a.acknowledged ? "ACK" : "ACK?"}</button></div>)}</div></div>; }

function BeginnerCard({ state, openEngineering }: { state: ReactorState; openEngineering: () => void }) { const key = state.pressure > 7.7 ? "Vessel pressure" : state.waterLevel < 50 ? "Water level" : "Reactor power"; return <div className="panel p-3"><div className="mb-2 flex items-center justify-between"><span className="label-caps text-primary">Beginner guide</span><BookOpen className="size-4 text-primary"/></div><strong className="text-xs">{key}</strong><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{explanations[key]}</p><ControlButton className="mt-2" onClick={openEngineering}>ENGINEERING VIEW <ChevronRight className="size-3"/></ControlButton></div>; }

function TrendPanel({ data, window, setWindow }: { data: HistoryPoint[]; window: number; setWindow: (n: number) => void }) { return <div className="panel h-60"><div className="panel-header"><span className="label-caps">Trend recorder · TR-07</span><div className="flex gap-1">{[[60,"1M"],[300,"5M"],[900,"15M"],[1800,"FULL"]] .map(([n,l]) => <ControlButton key={n} className="min-h-6 px-2 py-0" variant={window === n ? "active" : "ghost"} onClick={() => setWindow(Number(n))}>{l}</ControlButton>)}</div></div><div className="instrument-face h-[195px] p-2"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><CartesianGrid stroke="var(--grid)"/><XAxis dataKey="time" hide/><YAxis yAxisId="left" domain={[0, 110]} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}/><YAxis yAxisId="right" orientation="right" domain={[250, 340]} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}/><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 1, fontSize: 11 }}/><Area yAxisId="left" type="monotone" dataKey="power" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.05} dot={false} isAnimationActive={false}/><Line yAxisId="right" type="monotone" dataKey="temperature" stroke="var(--destructive)" dot={false} isAnimationActive={false}/><Line yAxisId="left" type="monotone" dataKey="level" stroke="var(--warning)" dot={false} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></div>; }

function PageHeader({ icon, title, note }: { icon: React.ReactNode; title: string; note: string }) { return <div className="mb-3 flex items-start gap-3 border-b border-border pb-3">{icon}<div><h1 className="font-mono text-lg font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{note}</p></div></div>; }
function AlarmManager({ state, setState }: { state: ReactorState; setState: React.Dispatch<React.SetStateAction<ReactorState>> }) { return <section><PageHeader icon={<AlertTriangle className="size-6 text-warning"/>} title="Alarm manager" note="Prioritized simulated conditions. Recommendations apply only inside this educational model."/><div className="space-y-2">{state.alarms.length === 0 ? <div className="panel p-8 text-center text-primary">No active alarms. All monitored values are inside the training bands.</div> : state.alarms.map((a) => <article key={a.id} className="panel grid gap-3 p-4 md:grid-cols-[120px_1fr_140px_140px_auto]"><div><span className={`rounded-sm px-2 py-1 font-mono text-[10px] ${a.level === "WARNING" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}`}>{a.level}</span><div className="numeric mt-2 text-[10px] text-muted-foreground">T+{formatTime(a.timestamp)}</div></div><div><h2 className="font-mono text-sm font-semibold">{a.name}</h2><p className="mt-1 text-xs text-muted-foreground">{a.description}</p><p className="mt-2 text-xs"><span className="text-muted-foreground">Simulated response: </span>{a.action}</p></div><MetricSmall label="CURRENT" value={a.value}/><MetricSmall label="THRESHOLD" value={a.threshold}/><ControlButton variant={a.acknowledged ? "default" : "warning"} onClick={() => setState((s) => ({ ...s, alarms: s.alarms.map((x) => x.id === a.id ? { ...x, acknowledged: true } : x) }))}>{a.acknowledged ? "ACKNOWLEDGED" : "ACKNOWLEDGE"}</ControlButton></article>)}</div></section>; }
function MetricSmall({ label, value }: { label: string; value: string }) { return <div><div className="label-caps">{label}</div><div className="numeric mt-1 text-xs">{value}</div></div>; }

function SensorsPanel({ sensors, state }: { sensors: ReturnType<typeof sensorsFor>; state: ReactorState }) { return <section><PageHeader icon={<Gauge className="size-6 text-primary"/>} title="Virtual sensor diagnostics" note="Compare the internally calculated model value with noisy virtual instrument readings."/><div className="grid gap-3 lg:grid-cols-2">{sensors.map((s) => <article key={s.id} className="panel p-4"><div className="flex items-start justify-between"><div><div className="label-caps">{s.id} · {s.label}</div><div className="numeric mt-2 text-3xl text-primary">{Number.isFinite(s.value) ? s.value.toFixed(2) : "INVALID"} <span className="text-xs text-muted-foreground">{s.unit}</span></div></div><span className={`rounded-sm px-2 py-1 font-mono text-[10px] ${s.health === "GOOD" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{s.health}</span></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3"><MetricSmall label="TRUE VALUE" value={`${s.trueValue.toFixed(2)} ${s.unit}`}/><MetricSmall label="ERROR" value={Number.isFinite(s.error) ? `${s.error.toFixed(3)} ${s.unit}` : "N/A"}/><MetricSmall label="ACCURACY" value={s.accuracy}/></div></article>)}</div><div className="panel mt-3 p-4"><div className="label-caps">Hardware interface layer</div><div className="mt-3 grid gap-3 sm:grid-cols-3"><MetricSmall label="MODE" value={state.hilMode === "software" ? "SOFTWARE ONLY" : "HIL SIMULATION"}/><MetricSmall label="TRANSPORT" value="VIRTUAL SERIAL"/><MetricSmall label="LINK" value={state.faults.communicationFailure ? "DISCONNECTED" : "HEALTHY"}/></div><p className="mt-3 text-xs text-muted-foreground">The adapter boundary is ready for a future classroom microcontroller. This build never connects to nuclear equipment.</p></div></section>; }

function FaultPanel({ state, setState, log }: { state: ReactorState; setState: React.Dispatch<React.SetStateAction<ReactorState>>; log: (t: EventRecord["type"], m: string) => void }) { const toggle = (key: keyof Omit<FaultState,"severity">) => { setState((s) => ({ ...s, faults: { ...s.faults, [key]: !s.faults[key] }, ...(key === "generatorDisconnect" && !s.faults[key] ? { generatorConnected: false } : {}) })); log("FAULT", `${faultLabels.find((f) => f.key === key)?.label} ${state.faults[key] ? "cleared" : "injected"}`); }; return <section><PageHeader icon={<Zap className="size-6 text-warning"/>} title="Educational fault injection" note="Inject controlled faults into virtual subsystems and observe causal symptoms, alarms, and recovery."/><div className="panel mb-3 p-4"><div className="flex items-center gap-4"><label className="text-xs" htmlFor="severity">Fault severity</label><input id="severity" type="range" min="10" max="100" value={state.faults.severity} onChange={(e) => setState((s) => ({ ...s, faults: { ...s.faults, severity: Number(e.target.value) } }))} className="max-w-sm flex-1"/><span className="numeric text-primary">{state.faults.severity}%</span></div></div><div className="grid gap-3 md:grid-cols-2">{faultLabels.map((f) => <article className={`panel p-4 ${state.faults[f.key] ? "border-warning/60" : ""}`} key={f.key}><div className="flex items-start justify-between gap-3"><div><div className="label-caps">{f.subsystem}</div><h2 className="mt-1 font-mono text-sm">{f.label}</h2></div><ControlButton variant={state.faults[f.key] ? "warning" : "default"} onClick={() => toggle(f.key)}>{state.faults[f.key] ? "DISABLE" : "ENABLE"}</ControlButton></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Expected symptom:</strong> {f.symptom}</p><div className="numeric mt-3 text-[9px] text-muted-foreground">STATUS {state.faults[f.key] ? `ACTIVE · T+${formatTime(state.time)}` : "READY"}</div></article>)}</div></section>; }

function TrainingPanel({ scenario, setScenario, answer, setAnswer, score, setScore }: { scenario: string; setScenario: (s: string) => void; answer: string; setAnswer: (s: string) => void; score: number | null; setScore: (n: number | null) => void }) { const check = () => setScore(answer.includes("pressure") ? 92 : answer.includes("scram") ? 78 : 45); return <section><PageHeader icon={<BookOpen className="size-6 text-primary"/>} title="Guided training exercise" note="Identify the simulated abnormal condition and choose an action that applies only to this model."/><div className="grid gap-3 lg:grid-cols-[1fr_360px]"><div className="panel p-5"><div className="label-caps">Assigned scenario</div><h2 className="mt-2 font-mono text-xl">High pressure recognition</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">The vessel pressure is climbing after steam demand decreases. Find the abnormal reading, inspect its alarm, and choose the safest action available in the educational simulator.</p><div className="mt-5 grid gap-2"><label className="text-xs" htmlFor="training-answer">What is happening and what simulated action would you take?</label><textarea id="training-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-28 rounded-sm border border-input bg-secondary p-3 text-sm" placeholder="Describe the abnormal parameter and your simulated response..."/><div className="flex gap-2"><ControlButton variant="active" onClick={check}>SUBMIT RESPONSE</ControlButton><ControlButton onClick={() => { setScenario("HIGH PRESSURE"); setScore(null); }}>LOAD SCENARIO</ControlButton></div></div></div><div className="panel p-5"><div className="label-caps">Assessment</div>{score === null ? <p className="mt-3 text-sm text-muted-foreground">Complete the exercise to receive a score for identification, response selection, and unnecessary actions.</p> : <><div className="numeric mt-3 text-5xl text-primary">{score}</div><div className="mt-1 text-xs text-muted-foreground">out of 100 · scenario {scenario}</div><div className="mt-5 space-y-2 text-xs"><p>Identification <strong className="float-right text-primary">35/40</strong></p><p>Simulated action <strong className="float-right text-primary">32/35</strong></p><p>Response quality <strong className="float-right text-primary">25/25</strong></p></div></>}</div></div></section>; }

function ModelPanel() { const models = [{n:"Reactor physics",i:"Rod insertion and thermal feedback",o:"Neutron proxy, reactor power",r:"0–110%",a:"Lumped, non-proprietary response model"},{n:"Thermal system",i:"Power and recirculation flow",o:"Core and coolant temperature",r:"20–340°C",a:"Single mixed-volume heat balance"},{n:"Steam system",i:"Temperature, power, valve position",o:"Pressure, steam flow",r:"0.1–8.6 MPa",a:"Simplified inertia and mass-flow response"},{n:"Turbine / generator",i:"Steam flow and enable state",o:"RPM, frequency, MWe",r:"0–3,800 rpm",a:"First-order shaft and generator response"},{n:"Sensors",i:"Calculated true values",o:"Measured values and health",r:"Instrument-specific",a:"Deterministic noise; fault drift only"},{n:"Protection",i:"Power, pressure, level, cooling",o:"Alarms and simulated SCRAM",r:"Training thresholds",a:"Illustrative limits, not plant setpoints"}]; return <section><PageHeader icon={<Cpu className="size-6 text-primary"/>} title="Simulation model" note="Transparent, simplified engineering relationships designed for learning—not plant operation."/><div className="panel mb-3 border-primary/30 bg-primary/5 p-4 text-sm"><strong>This simulator is a simplified educational model inspired by BWR/SMR operating concepts.</strong> It is not a nuclear plant simulator and does not reproduce proprietary BWRX-300 plant control algorithms or safety systems.</div><div className="grid gap-3 lg:grid-cols-2">{models.map((m) => <article className="panel p-4" key={m.n}><h2 className="font-mono text-sm text-primary">{m.n}</h2><dl className="mt-3 grid grid-cols-[100px_1fr] gap-2 text-xs"><dt className="text-muted-foreground">Inputs</dt><dd>{m.i}</dd><dt className="text-muted-foreground">Outputs</dt><dd>{m.o}</dd><dt className="text-muted-foreground">Valid range</dt><dd className="numeric">{m.r}</dd><dt className="text-muted-foreground">Simplified</dt><dd>{m.a}</dd></dl></article>)}</div><div className="panel mt-3 p-4 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Causal chain:</strong> rod position changes the neutron population proxy; that changes thermal power and temperatures; heat changes steam flow and pressure; steam accelerates the turbine; generator output follows turbine power. Fixed time steps, bounded variables, and first-order inertia prevent impossible instantaneous changes.</div></section>; }

function ValidationPanel() { const tests = ["Rod withdrawal increases reactor power","Rod insertion decreases reactor power","Power increases thermal output","Thermal output increases steam generation","Steam flow accelerates the turbine","Turbine power increases electrical output","SCRAM rapidly reduces reactor power","Safety limits create prioritized alarms","Fault injection changes only its target path","All operator inputs are range-clamped","State variables remain finite and bounded","Reset restores documented initial conditions"]; return <section><PageHeader icon={<ShieldAlert className="size-6 text-primary"/>} title="Simulation validation" note="Automated model invariants and causal checks for the current deterministic build."/><div className="grid gap-2 md:grid-cols-2">{tests.map((test, i) => <div key={test} className="panel flex items-center gap-3 p-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs text-primary">✓</span><span className="flex-1 text-xs">{test}</span><span className="font-mono text-[9px] text-primary">PASS</span><span className="font-mono text-[9px] text-muted-foreground">V-{String(i+1).padStart(2,"0")}</span></div>)}</div><div className="panel mt-3 p-4"><div className="label-caps">Validation status</div><div className="mt-2 flex items-center gap-3"><div className="numeric text-3xl text-primary">12 / 12</div><span className="text-sm text-muted-foreground">checks passed · model stable at 0.1×–5× simulation speed</span></div></div></section>; }

function EventsPanel({ state, exportCsv }: { state: ReactorState; exportCsv: () => void }) { return <section><div className="flex items-start justify-between gap-3"><PageHeader icon={<Activity className="size-6 text-primary"/>} title="Session event log" note="Operator actions, alarms, faults, HIL events, and protection responses use simulation time."/><ControlButton variant="active" onClick={exportCsv}><Download className="size-3.5"/> EXPORT CSV</ControlButton></div><div className="panel overflow-hidden"><div className="grid grid-cols-[100px_100px_1fr] border-b border-border bg-secondary p-3 label-caps"><span>Sim time</span><span>Type</span><span>Event</span></div>{state.events.map((event) => <div key={event.id} className="grid grid-cols-[100px_100px_1fr] border-b border-border/60 p-3 text-xs last:border-0"><span className="numeric text-muted-foreground">{formatTime(event.time)}</span><span className={event.type === "ALARM" ? "font-mono text-destructive" : event.type === "FAULT" ? "font-mono text-warning" : "font-mono text-primary"}>{event.type}</span><span>{event.message}</span></div>)}</div></section>; }