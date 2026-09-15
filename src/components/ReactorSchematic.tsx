import type { ReactorState } from "@/lib/simulator";

export function ReactorSchematic({ state }: { state: ReactorState }) {
  const flowSpeed = Math.max(0.4, 2.4 - state.steamFlow / 180);
  return (
    <svg viewBox="0 0 820 390" className="h-full min-h-64 w-full" role="img" aria-label="Animated simplified reactor, steam turbine, condenser and feedwater process">
      <defs>
        <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" className="fill-primary" /></marker>
      </defs>
      <path d="M260 93 H410 V80 H545" className="process-pipe process-steam" />
      <path d="M260 93 H410 V80 H545" className="process-flow process-flow-hot" style={{ animationDuration: `${flowSpeed}s` }} />
      <path d="M675 105 H730 V275 H590" className="process-pipe" />
      <path d="M675 105 H730 V275 H590" className="process-flow" style={{ animationDuration: `${flowSpeed + 0.5}s` }} />
      <path d="M480 275 H260 V245" className="process-pipe" />
      <path d="M480 275 H260 V245" className="process-flow" style={{ animationDuration: `${flowSpeed + 0.2}s` }} />

      <rect x="110" y="62" width="150" height="205" rx="28" className="fill-panel-raised stroke-primary" strokeWidth="3" />
      <path d="M113 150 H257 V239 Q257 264 232 264 H138 Q113 264 113 239Z" className="fill-coolant/40" />
      <rect x="155" y="176" width="62" height="58" rx="5" className="fill-warning/35 stroke-warning" strokeWidth="2" />
      <text x="186" y="208" textAnchor="middle" className="process-label">CORE</text>
      {[150, 177, 204].map((x) => <rect key={x} x={x} y={88} width="10" height={38 + state.actualRod * 0.82} rx="3" className="fill-muted-foreground transition-all duration-300" />)}
      <text x="185" y="48" textAnchor="middle" className="process-title">REACTOR VESSEL</text>
      <text x="185" y="292" textAnchor="middle" className="process-readout">{state.powerPercent.toFixed(1)}% · {state.coreTemperature.toFixed(0)}°C</text>

      <rect x="340" y="45" width="110" height="90" rx="5" className="fill-panel-raised stroke-border" strokeWidth="2" />
      <path d="M365 60 V118 M387 60 V118 M409 60 V118 M431 60 V118" className="stroke-primary" strokeWidth="3" />
      <text x="395" y="28" textAnchor="middle" className="process-title">STEAM SEPARATOR</text>
      <text x="395" y="155" textAnchor="middle" className="process-readout">{state.steamFlow.toFixed(0)} kg/s</text>

      <rect x="545" y="45" width="130" height="120" rx="5" className="fill-panel-raised stroke-border" strokeWidth="2" />
      <g className={state.turbineRpm > 10 ? "process-spin" : ""} style={{ animationDuration: `${Math.max(0.35, 3 - state.turbineRpm / 1400)}s` }}>
        <circle cx="610" cy="100" r="33" className="fill-none stroke-primary" strokeWidth="3" />
        <path d="M610 66 V134 M576 100 H644 M586 76 L634 124 M634 76 L586 124" className="stroke-primary" strokeWidth="3" />
      </g>
      <text x="610" y="28" textAnchor="middle" className="process-title">TURBINE / GENERATOR</text>
      <text x="610" y="187" textAnchor="middle" className="process-readout">{state.turbineRpm.toFixed(0)} rpm · {state.electricalOutput.toFixed(1)} MWe</text>

      <rect x="480" y="235" width="110" height="80" rx="5" className="fill-panel-raised stroke-border" strokeWidth="2" />
      <path d="M500 255 Q535 290 570 255 M500 275 Q535 310 570 275" className="fill-none stroke-primary" strokeWidth="2" />
      <text x="535" y="335" textAnchor="middle" className="process-title">CONDENSER</text>
      <text x="535" y="354" textAnchor="middle" className="process-readout">{state.condenserPressure.toFixed(1)} kPa</text>

      <circle cx="355" cy="275" r="28" className="fill-panel-raised stroke-border" strokeWidth="2" />
      <g className={state.pumpA || state.pumpB ? "process-spin" : ""}><path d="M355 252 V298 M332 275 H378" className="stroke-primary" strokeWidth="4" /></g>
      <text x="355" y="327" textAnchor="middle" className="process-title">FEEDWATER</text>
      <text x="355" y="346" textAnchor="middle" className="process-readout">{state.feedwaterFlow.toFixed(0)} kg/s</text>

      <g transform="translate(18 325)"><circle cx="7" cy="7" r="5" className="fill-primary"/><text x="20" y="11" className="process-readout">LIVE FLOW</text><circle cx="112" cy="7" r="5" className="fill-warning"/><text x="125" y="11" className="process-readout">STEAM / HEAT</text></g>
    </svg>
  );
}
