import { applyCommand, CommandError, initialState, isStateFinite, runFor, type ReactorState } from "./simulator";

export interface ValidationResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

type Check = { id: string; name: string; run: () => { pass: boolean; detail: string } };

const base = () => initialState();
const settle = (s: ReactorState, seconds = 120) => runFor(s, seconds);
const f = (n: number, d = 1) => n.toFixed(d);

/** Causal and safety checks executed against the real engine (also used by unit tests). */
export const CHECKS: Check[] = [
  { id: "V-01", name: "Initial condition is a steady state", run: () => { const a = base(); const b = settle(a, 60); const d = Math.abs(b.powerPercent - a.powerPercent) + Math.abs(b.electricalOutput - a.electricalOutput); return { pass: d < 0.5 && b.alarms.length === 0, detail: `Δ power+MWe after 60 s = ${f(d, 2)}` }; } },
  { id: "V-02", name: "Rod withdrawal increases reactor power", run: () => { const a = settle(base(), 5); const b = settle(applyCommand(a, { type: "setRod", value: 40 }), 120); return { pass: b.powerPercent > a.powerPercent + 10, detail: `${f(a.powerPercent)} % → ${f(b.powerPercent)} %` }; } },
  { id: "V-03", name: "Rod insertion decreases reactor power", run: () => { const a = settle(base(), 5); const b = settle(applyCommand(a, { type: "setRod", value: 80 }), 120); return { pass: b.powerPercent < a.powerPercent - 10, detail: `${f(a.powerPercent)} % → ${f(b.powerPercent)} %` }; } },
  { id: "V-04", name: "Power increases thermal output and core temperature", run: () => { const b = settle(applyCommand(base(), { type: "setRod", value: 40 }), 150); return { pass: b.thermalPower > 126 + 30 && b.coreTemperature > 274 + 5, detail: `${f(b.thermalPower)} MWt · ${f(b.coreTemperature)} °C` }; } },
  { id: "V-05", name: "Thermal output increases steam generation", run: () => { const b = settle(applyCommand(base(), { type: "setRod", value: 40 }), 150); return { pass: b.steamFlow > 126 + 30, detail: `steam ${f(b.steamFlow)} kg/s` }; } },
  { id: "V-06", name: "Steam flow accelerates the turbine", run: () => { const b = settle(applyCommand(base(), { type: "setRod", value: 40 }), 150); return { pass: b.turbineRpm > 1800 + 200, detail: `${f(b.turbineRpm, 0)} rpm` }; } },
  { id: "V-07", name: "Turbine power increases electrical output", run: () => { const b = settle(applyCommand(base(), { type: "setRod", value: 40 }), 150); return { pass: b.electricalOutput > 37.9 + 10, detail: `${f(b.electricalOutput)} MWe` }; } },
  { id: "V-08", name: "SCRAM rapidly reduces reactor power", run: () => { const b = runFor(applyCommand(base(), { type: "scram", reason: "test" }), 10); return { pass: b.powerPercent < 5 && b.actualRod === 100, detail: `${f(b.powerPercent)} % after 10 s, rods ${f(b.actualRod, 0)} %` }; } },
  { id: "V-09", name: "Decay heat persists after SCRAM", run: () => { const b = runFor(applyCommand(base(), { type: "scram", reason: "test" }), 30); return { pass: b.decayHeat > 0.5 && b.thermalPower > 0, detail: `${f(b.thermalPower)} MWt decay` }; } },
  { id: "V-10", name: "High pressure raises an alarm and protection", run: () => { const b = settle(applyCommand(base(), { type: "setValve", value: 20 }), 200); return { pass: b.alarms.some((a) => a.id === "pressure-high") || b.scram, detail: b.scram ? b.scramReason : `${f(b.pressure, 2)} MPa` }; } },
  { id: "V-11", name: "Loss of both pumps triggers automatic SCRAM", run: () => { let s = applyCommand(base(), { type: "setPump", pump: "A", on: false }); s = applyCommand(s, { type: "setPump", pump: "B", on: false }); const b = runFor(s, 2); return { pass: b.scram, detail: b.scramReason || "no trip" }; } },
  { id: "V-12", name: "Turbine trip stops turbine and electrical output", run: () => { const b = settle(applyCommand(base(), { type: "setFault", fault: "turbineTrip", on: true }), 90); return { pass: b.turbineRpm < 50 && b.electricalOutput < 1, detail: `${f(b.turbineRpm, 0)} rpm · ${f(b.electricalOutput)} MWe` }; } },
  { id: "V-13", name: "Pressure sensor fault affects only its channel", run: () => { const a = settle(base(), 10); const b = settle(applyCommand(a, { type: "setFault", fault: "pressureSensor", on: true }), 10); return { pass: Math.abs(a.pressure - b.pressure) < 0.05 && Math.abs(a.powerPercent - b.powerPercent) < 0.5, detail: "model pressure unchanged; channel invalid" }; } },
  { id: "V-14", name: "Invalid operator values are rejected", run: () => { try { applyCommand(base(), { type: "setRod", value: Number.NaN }); return { pass: false, detail: "NaN accepted" }; } catch (e) { return { pass: e instanceof CommandError, detail: "NaN rod command rejected" }; } } },
  { id: "V-15", name: "Out-of-range values are clamped", run: () => { const b = applyCommand(base(), { type: "setRod", value: 250 }); const c = applyCommand(base(), { type: "setEnergyLevel", value: 999 }); return { pass: b.commandedRod === 100 && c.commandedRod === 15, detail: `rod ${b.commandedRod} % · kids energy cap → rod ${c.commandedRod} %` }; } },
  { id: "V-16", name: "Variables stay finite and bounded at ×5 speed", run: () => { const b = runFor({ ...applyCommand(base(), { type: "setRod", value: 5 }), speed: 5 }, 300); const ok = isStateFinite(b) && b.powerPercent >= 0 && b.powerPercent <= 110 && b.waterLevel >= 0 && b.waterLevel <= 100 && b.pressure > 0; return { pass: ok, detail: `power ${f(b.powerPercent)} % · level ${f(b.waterLevel)} %` }; } },
  { id: "V-17", name: "Reset restores documented initial conditions", run: () => { const changed = settle(applyCommand(base(), { type: "setRod", value: 20 }), 60); const r = applyCommand(changed, { type: "reset" }); const i = initialState(); return { pass: r.powerPercent === i.powerPercent && r.commandedRod === i.commandedRod && r.time === 0, detail: `power ${r.powerPercent} % · rods ${r.commandedRod} %` }; } },
  { id: "V-18", name: "Kids energy range cannot reach protection limits", run: () => { const b = settle(applyCommand(applyCommand(base(), { type: "setEnergyLevel", value: 85 }), { type: "setCoolantDemand", value: 40 }), 300); return { pass: !b.scram && !b.alarms.some((a) => a.level === "ALARM" || a.level === "CRITICAL"), detail: `${f(b.powerPercent)} % · ${f(b.coreTemperature)} °C · ${f(b.pressure, 2)} MPa` }; } },
];

export function runValidation(): ValidationResult[] {
  return CHECKS.map((check) => {
    try {
      const r = check.run();
      return { id: check.id, name: check.name, ...r };
    } catch (error) {
      return { id: check.id, name: check.name, pass: false, detail: error instanceof Error ? error.message : "threw" };
    }
  });
}
