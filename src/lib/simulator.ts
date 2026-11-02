/**
 * NUCLEUS educational reactor model.
 *
 * A simplified, non-proprietary, lumped-parameter model inspired by boiling-water
 * reactor concepts. Values are teaching values only. This module is the single
 * source of truth for every reading shown in Kids Mode and Engineering Mode.
 *
 * Causal chain (each step lags the previous one through first-order inertia):
 *   rod position → reactivity proxy → neutron proxy → reactor power → thermal power
 *   → core / coolant temperature → steam generation → pressure & steam flow
 *   → turbine speed → turbine power → generator electrical output
 */

export type Severity = "INFO" | "WARNING" | "ALARM" | "CRITICAL";
export type RunMode = "kids" | "engineering";
export type HilMode = "software" | "hil";

export interface Alarm {
  id: string;
  level: Severity;
  name: string;
  description: string;
  value: string;
  threshold: string;
  action: string;
  timestamp: number;
  acknowledged: boolean;
  active: boolean;
}

export interface EventRecord {
  id: number;
  time: number;
  type: "OPERATOR" | "SYSTEM" | "ALARM" | "FAULT" | "HIL" | "ERROR";
  message: string;
}

export interface FaultState {
  sensorDrift: boolean;
  pressureSensor: boolean;
  levelSensor: boolean;
  pumpDegradation: boolean;
  turbineTrip: boolean;
  generatorDisconnect: boolean;
  communicationFailure: boolean;
  rodFailure: boolean;
  severity: number;
}

export type FaultKey = keyof Omit<FaultState, "severity">;

export interface ReactorState {
  time: number;
  paused: boolean;
  speed: number;
  mode: RunMode;
  hilMode: HilMode;
  demoRunning: boolean;
  scram: boolean;
  scramReason: string;
  commandedRod: number;
  actualRod: number;
  rodMoving: "INSERTING" | "WITHDRAWING" | "HOLD" | "FAILED";
  /** Reactivity proxy in arbitrary "pcm-equivalent" teaching units. */
  reactivity: number;
  neutronProxy: number;
  reactorPeriod: number;
  powerPercent: number;
  thermalPower: number;
  decayHeat: number;
  coreTemperature: number;
  coolantTemperature: number;
  pressure: number;
  waterLevel: number;
  steamFlow: number;
  steamTemperature: number;
  turbineRpm: number;
  turbinePower: number;
  electricalOutput: number;
  frequency: number;
  condenserPressure: number;
  feedwaterFlow: number;
  recirculationFlow: number;
  valvePosition: number;
  /** Recirculation pump speed demand, 40–100 %. */
  coolantDemand: number;
  /** Feedwater level-controller setpoint, 55–85 %. */
  feedwaterSetpoint: number;
  /** Multiplier applied to modelled sensor noise, 0–3. */
  sensorNoise: number;
  pumpA: boolean;
  pumpB: boolean;
  turbineEnabled: boolean;
  breakerClosed: boolean;
  generatorConnected: boolean;
  faults: FaultState;
  alarms: Alarm[];
  events: EventRecord[];
}

export interface SensorReading {
  id: string;
  label: string;
  trueValue: number;
  value: number;
  unit: string;
  error: number;
  noise: string;
  accuracy: string;
  health: "GOOD" | "DRIFT" | "FAILED";
}

export interface HistoryPoint {
  time: number;
  power: number;
  temperature: number;
  pressure: number;
  level: number;
  steam: number;
  turbine: number;
  electrical: number;
  rods: number;
}

/** Bounded operator ranges. Every input path (UI, HIL) goes through these. */
export const LIMITS = {
  rod: [0, 100],
  kidsEnergy: [10, 85],
  coolantDemand: [40, 100],
  feedwaterSetpoint: [55, 85],
  valve: [0, 100],
  sensorNoise: [0, 3],
  severity: [10, 100],
} as const;
export const SPEEDS = [0.1, 0.5, 1, 2, 5] as const;
export const TIMESTEP_SECONDS = 0.1;

export const SCENARIOS = ["STARTUP", "NORMAL OPERATION", "POWER INCREASE", "POWER DECREASE", "TURBINE TRIP", "LOSS OF SENSOR", "LOW WATER LEVEL", "HIGH PRESSURE", "CONTROL ROD FAILURE", "SCRAM"] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const approach = (value: number, target: number, rate: number) => value + (target - value) * clamp(rate, 0, 1);

let eventCounter = 1;
export function makeEvent(time: number, type: EventRecord["type"], message: string): EventRecord {
  eventCounter += 1;
  return { id: eventCounter, time, type, message };
}
export function withEvent(state: ReactorState, type: EventRecord["type"], message: string): ReactorState {
  return { ...state, events: [makeEvent(state.time, type, message), ...state.events].slice(0, 200) };
}

/** Documented initial condition: a true steady state at 42 % power (rods 58 % inserted). */
export function initialState(): ReactorState {
  return {
    time: 0, paused: false, speed: 1, mode: "engineering", hilMode: "software", demoRunning: false,
    scram: false, scramReason: "", commandedRod: 58, actualRod: 58, rodMoving: "HOLD",
    reactivity: 0, neutronProxy: 0.42, reactorPeriod: 999, powerPercent: 42, thermalPower: 126,
    decayHeat: 0, coreTemperature: 274, coolantTemperature: 265.2, pressure: 7.0,
    waterLevel: 70, steamFlow: 126, steamTemperature: 289, turbineRpm: 1800,
    turbinePower: 39.9, electricalOutput: 37.9, frequency: 30, condenserPressure: 8.96,
    feedwaterFlow: 126, recirculationFlow: 416, valvePosition: 68,
    coolantDemand: 80, feedwaterSetpoint: 70, sensorNoise: 1,
    pumpA: true, pumpB: true, turbineEnabled: true, breakerClosed: true, generatorConnected: true,
    faults: { sensorDrift: false, pressureSensor: false, levelSensor: false, pumpDegradation: false, turbineTrip: false, generatorDisconnect: false, communicationFailure: false, rodFailure: false, severity: 45 },
    alarms: [],
    events: [{ id: 1, time: 0, type: "SYSTEM", message: "Simulation initialized at stable partial power (42 %)" }],
  };
}

function activeAlarm(id: string, level: Severity, name: string, description: string, value: string, threshold: string, action: string, state: ReactorState): Alarm {
  const previous = state.alarms.find((alarm) => alarm.id === id);
  // Re-raise acknowledgement if the alarm escalates to a higher level.
  const escalated = previous && previous.level !== level && level === "CRITICAL";
  return { id, level, name, description, value, threshold, action, timestamp: previous?.timestamp ?? state.time, acknowledged: escalated ? false : previous?.acknowledged ?? false, active: true };
}

const LEVEL_ORDER: Record<Severity, number> = { CRITICAL: 0, ALARM: 1, WARNING: 2, INFO: 3 };

export function evaluateAlarms(state: ReactorState): Alarm[] {
  const alarms: Alarm[] = [];
  if (state.scram) alarms.push(activeAlarm("scram", "CRITICAL", "REACTOR SCRAM", state.scramReason || "Protective shutdown initiated", `${state.powerPercent.toFixed(1)} %`, "Protection demand", "Observe simulated cooldown and identify the initiating condition.", state));
  if (state.powerPercent > 92) alarms.push(activeAlarm("power-high", state.powerPercent > 104 ? "CRITICAL" : "ALARM", "HIGH REACTOR POWER", "Simulated reactor power exceeded the training limit.", `${state.powerPercent.toFixed(1)} %`, "> 92 %", "Insert control rods to reduce the simulated power demand.", state));
  if (state.coreTemperature > 325) alarms.push(activeAlarm("temp-high", state.coreTemperature > 338 ? "CRITICAL" : "ALARM", "HIGH CORE TEMPERATURE", "Core heat removal is not keeping up with heat generation.", `${state.coreTemperature.toFixed(1)} °C`, "> 325 °C", "Increase recirculation flow or reduce power.", state));
  if (state.pressure > 7.7) alarms.push(activeAlarm("pressure-high", state.pressure > 8.1 ? "CRITICAL" : "ALARM", "HIGH VESSEL PRESSURE", "Steam pressure is above the normal training band.", `${state.pressure.toFixed(2)} MPa`, "> 7.70 MPa", "Open the steam valve, reduce power, or verify turbine availability.", state));
  if (state.waterLevel < 48) alarms.push(activeAlarm("level-low", state.waterLevel < 35 ? "CRITICAL" : "ALARM", "LOW VESSEL WATER LEVEL", "Simulated vessel inventory is below the safe training band.", `${state.waterLevel.toFixed(1)} %`, "< 48 %", "Raise the feedwater setpoint and reduce power demand.", state));
  if (state.waterLevel > 92) alarms.push(activeAlarm("level-high", "WARNING", "HIGH VESSEL WATER LEVEL", "Inventory is above the normal band; moisture carry-over risk in this model.", `${state.waterLevel.toFixed(1)} %`, "> 92 %", "Lower the feedwater setpoint.", state));
  if (!state.pumpA && !state.pumpB) alarms.push(activeAlarm("cooling-loss", "CRITICAL", "LOSS OF RECIRCULATION", "Both simulated coolant pumps are unavailable.", "0 pumps", "At least 1 required", "Restore a virtual pump.", state));
  else if (!state.pumpA || !state.pumpB) alarms.push(activeAlarm("pump-single", "INFO", "SINGLE PUMP OPERATION", "One recirculation pump is stopped; flow and power capacity are reduced.", "1 pump", "2 pumps", "Restart the stopped pump when appropriate.", state));
  if (state.faults.pressureSensor || state.faults.levelSensor) alarms.push(activeAlarm("sensor-failure", "WARNING", "INSTRUMENT CHANNEL FAILURE", "One or more virtual sensor channels are unavailable.", "INVALID", "Healthy channel", "Compare true-value diagnostics on the Sensors page.", state));
  if (state.faults.sensorDrift) alarms.push(activeAlarm("sensor-drift", "WARNING", "SENSOR DRIFT DETECTED", "Measured values are diverging from the model values.", `${(state.faults.severity * 0.035).toFixed(2)} offset`, "< 0.5", "Recalibrate (clear the fault).", state));
  if (state.faults.communicationFailure) alarms.push(activeAlarm("hil-comms", "WARNING", "HIL COMMUNICATION LOSS", "The hardware link is suspended; virtual I/O remains active.", "DISCONNECTED", "Connected", "Continue in software-only mode or clear the fault.", state));
  if (state.faults.turbineTrip) alarms.push(activeAlarm("turbine-trip", "ALARM", "TURBINE TRIP", "The turbine has tripped and steam is bypassed to the condenser.", `${state.turbineRpm.toFixed(0)} rpm`, "Trip signal", "Observe the pressure response and reduce power.", state));
  if (!state.generatorConnected && state.turbineRpm > 300) alarms.push(activeAlarm("gen-open", "WARNING", "GENERATOR OFF-LINE", "The generator breaker is open; no electrical output.", "0 MWe", "Breaker closed", "Close the breaker or clear the disconnect fault.", state));
  if (state.faults.rodFailure && Math.abs(state.commandedRod - state.actualRod) > 3) alarms.push(activeAlarm("rod-failure", "ALARM", "CONTROL ROD MOTION FAILURE", "Actual rod position is not following the command.", `${Math.abs(state.commandedRod - state.actualRod).toFixed(1)} % mismatch`, "> 3 %", "Hold power changes and clear the fault.", state));
  return alarms.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

const NUMERIC_KEYS: (keyof ReactorState)[] = ["time", "commandedRod", "actualRod", "reactivity", "neutronProxy", "reactorPeriod", "powerPercent", "thermalPower", "decayHeat", "coreTemperature", "coolantTemperature", "pressure", "waterLevel", "steamFlow", "steamTemperature", "turbineRpm", "turbinePower", "electricalOutput", "frequency", "condenserPressure", "feedwaterFlow", "recirculationFlow", "valvePosition"];

export function isStateFinite(state: ReactorState) {
  return NUMERIC_KEYS.every((key) => Number.isFinite(state[key] as number));
}

/** Fraction of nominal recirculation available from the pumps (0–1). */
export function pumpAvailability(state: Pick<ReactorState, "pumpA" | "pumpB" | "faults">) {
  return ((state.pumpA ? 0.5 : 0) + (state.pumpB ? 0.5 : 0)) * (state.faults.pumpDegradation ? 1 - state.faults.severity / 140 : 1);
}

export function stepSimulation(input: ReactorState, dtSeconds: number): ReactorState {
  if (input.paused) return input;
  const dt = clamp(dtSeconds, 0.01, 0.25);
  const effectiveDt = dt * input.speed;
  // Sub-step at high speed so every first-order lag stays numerically stable (rate·dt ≤ 0.1).
  const subSteps = Math.max(1, Math.ceil(effectiveDt / 0.1));
  let state: ReactorState = { ...input, faults: { ...input.faults } };
  for (let i = 0; i < subSteps; i += 1) state = integrate(state, effectiveDt / subSteps);

  if (!isStateFinite(state)) {
    // Fail safe: keep the last valid state, stop the clock, and record the error.
    return withEvent({ ...input, paused: true }, "ERROR", "Numerical instability detected — simulation paused, previous valid state preserved");
  }

  const nextAlarms = evaluateAlarms(state);
  const critical = nextAlarms.find((alarm) => alarm.level === "CRITICAL" && alarm.id !== "scram");
  if (critical && !state.scram) {
    state.scram = true;
    state.commandedRod = 100;
    state.scramReason = `Automatic protection: ${critical.name}`;
    state = withEvent(state, "ALARM", state.scramReason);
  }
  state.alarms = evaluateAlarms(state);
  return state;
}

function integrate(input: ReactorState, h: number): ReactorState {
  const state = { ...input, time: input.time + h };

  // Control rods: rate-limited drive (3.2 %/s normal, 35 %/s on SCRAM).
  if (state.scram) state.commandedRod = 100;
  const rodDelta = state.commandedRod - state.actualRod;
  const rodRate = state.scram ? 35 : 3.2;
  if (state.faults.rodFailure && !state.scram) state.rodMoving = "FAILED";
  else if (Math.abs(rodDelta) < 0.05) { state.actualRod = state.commandedRod; state.rodMoving = "HOLD"; }
  else {
    state.actualRod = clamp(state.actualRod + Math.sign(rodDelta) * Math.min(Math.abs(rodDelta), rodRate * h), 0, 100);
    state.rodMoving = rodDelta > 0 ? "INSERTING" : "WITHDRAWING";
  }

  // Reactor: target power = withdrawn fraction × recirculation effect (void feedback proxy).
  const pumps = pumpAvailability(state);
  const coolFactor = pumps * state.coolantDemand / 100;
  const targetPower = state.scram ? 0 : clamp((100 - state.actualRod) * (0.78 + 0.22 * pumps), 0, 110);
  state.reactivity = (targetPower / 100 - state.neutronProxy) * 1000;
  state.neutronProxy = clamp(approach(state.neutronProxy, targetPower / 100, (state.scram ? 0.9 : 0.12) * h), 0, 1.1);
  const previousPower = state.powerPercent;
  state.powerPercent = clamp(approach(state.powerPercent, state.neutronProxy * 100, (state.scram ? 0.75 : 0.08) * h), 0, 110);
  const dPdt = (state.powerPercent - previousPower) / h;
  state.reactorPeriod = Math.abs(dPdt) < 1e-3 || state.powerPercent < 0.01 ? 999 : clamp(state.powerPercent / dPdt, -999, 999);
  state.decayHeat = state.scram ? approach(state.decayHeat, Math.max(1.5, input.powerPercent * 0.065), 0.08 * h) : approach(state.decayHeat, 0, 0.15 * h);
  state.thermalPower = clamp(state.powerPercent * 3 + state.decayHeat * 3, 0, 330);

  // Thermal-hydraulics: lumped core heat balance; more recirculation removes more heat.
  state.recirculationFlow = clamp(approach(state.recirculationFlow, 520 * coolFactor, 0.18 * h), 0, 560);
  const heatPercent = state.thermalPower / 3;
  const coreTarget = 280 + heatPercent * 0.62 - coolFactor * 40;
  state.coreTemperature = clamp(approach(state.coreTemperature, coreTarget, 0.035 * h), 20, 345);
  state.coolantTemperature = clamp(approach(state.coolantTemperature, state.coreTemperature - 4 - 6 * coolFactor, 0.08 * h), 20, 330);

  // Steam: generation follows heat; the valve throttles flow and raises pressure when closed.
  const valveFactor = clamp(state.valvePosition / 60, 0, 1);
  state.steamFlow = clamp(approach(state.steamFlow, state.thermalPower * valveFactor, 0.07 * h), 0, 340);
  state.steamTemperature = clamp(approach(state.steamTemperature, 268 + heatPercent * 0.5, 0.04 * h), 20, 320);
  const turbineAvailable = state.turbineEnabled && !state.faults.turbineTrip;
  const pressureTarget = 6.8 + heatPercent * 0.006 + (1 - valveFactor) * 1.6 - Math.max(0, state.valvePosition - 60) * 0.006 + (turbineAvailable ? 0 : 0.3);
  state.pressure = clamp(approach(state.pressure, pressureTarget, 0.055 * h), 0.1, 8.6);

  // Feedwater: proportional level controller around the operator setpoint.
  state.feedwaterFlow = clamp(approach(state.feedwaterFlow, state.steamFlow + (state.feedwaterSetpoint - state.waterLevel) * 3, 0.09 * h), 0, 360);
  state.waterLevel = clamp(state.waterLevel + (state.feedwaterFlow - state.steamFlow) * 0.003 * h, 0, 100);

  // Turbine-generator: speed and power follow steam flow; no steam → no rotation.
  const rpmTarget = turbineAvailable && state.steamFlow > 10 ? Math.min(3600, 900 + state.steamFlow * 7.143) : 0;
  state.turbineRpm = clamp(approach(state.turbineRpm, rpmTarget, (rpmTarget > state.turbineRpm ? 0.05 : 0.12) * h), 0, 3800);
  const turbinePowerTarget = turbineAvailable ? state.steamFlow * 0.317 * clamp(state.turbineRpm / 1800, 0, 1) : 0;
  state.turbinePower = clamp(approach(state.turbinePower, turbinePowerTarget, 0.07 * h), 0, 120);
  state.generatorConnected = state.breakerClosed && !state.faults.generatorDisconnect;
  state.electricalOutput = clamp(approach(state.electricalOutput, state.generatorConnected ? state.turbinePower * 0.95 : 0, 0.1 * h), 0, 115);
  state.frequency = clamp(state.turbineRpm / 60, 0, 63.3);
  state.condenserPressure = clamp(approach(state.condenserPressure, 7.2 + (state.steamFlow + (turbineAvailable ? 0 : state.steamFlow * 0.3)) * 0.014, 0.08 * h), 3, 16);
  return state;
}

// ───────────────────────── Control layer ─────────────────────────

export type Command =
  | { type: "setRod"; value: number }
  | { type: "setEnergyLevel"; value: number }
  | { type: "setCoolantDemand"; value: number }
  | { type: "setFeedwaterSetpoint"; value: number }
  | { type: "setValve"; value: number }
  | { type: "setPump"; pump: "A" | "B"; on: boolean }
  | { type: "setTurbine"; on: boolean }
  | { type: "setBreaker"; closed: boolean }
  | { type: "scram"; reason: string }
  | { type: "resetScram" }
  | { type: "setPaused"; paused: boolean }
  | { type: "setSpeed"; speed: number }
  | { type: "setSensorNoise"; value: number }
  | { type: "setFault"; fault: FaultKey; on: boolean }
  | { type: "setSeverity"; value: number }
  | { type: "acknowledge"; id: string }
  | { type: "acknowledgeAll" }
  | { type: "loadScenario"; name: ScenarioName }
  | { type: "reset" };

export type CommandSource = "OPERATOR" | "HIL" | "SYSTEM";

export const FAULT_LABELS: Record<FaultKey, string> = {
  sensorDrift: "Temperature sensor drift", pressureSensor: "Pressure sensor failure", levelSensor: "Water-level sensor failure",
  pumpDegradation: "Pump degradation", turbineTrip: "Turbine trip", generatorDisconnect: "Generator disconnect",
  communicationFailure: "HIL communication loss", rodFailure: "Control rod movement failure",
};

/** Kids energy level (10–85) ↔ rod insertion. Energy = 100 − rod insertion. */
export const energyFromRod = (rod: number) => clamp(100 - rod, 0, 100);

export class CommandError extends Error {}

function bounded(value: number, [min, max]: readonly [number, number], name: string) {
  if (!Number.isFinite(value)) throw new CommandError(`${name}: value must be a finite number`);
  return clamp(value, min, max);
}

/**
 * Apply a validated command. Returns a new state with the action logged.
 * Throws CommandError for invalid input or a blocked interlock; callers log the rejection.
 */
export function applyCommand(state: ReactorState, command: Command, source: CommandSource = "OPERATOR"): ReactorState {
  const log = (next: ReactorState, message: string) => withEvent(next, source, message);
  switch (command.type) {
    case "setRod": {
      if (state.scram) throw new CommandError("Rod withdrawal blocked: SCRAM is active (reset SCRAM first)");
      const v = bounded(command.value, LIMITS.rod, "Rod command");
      return log({ ...state, commandedRod: v }, `Rod command ${v.toFixed(0)} % inserted`);
    }
    case "setEnergyLevel": {
      if (state.scram) throw new CommandError("Energy change blocked while the safety system has the reactor shut down");
      const energy = bounded(command.value, LIMITS.kidsEnergy, "Energy level");
      return log({ ...state, commandedRod: 100 - energy }, `Energy level set to ${energy.toFixed(0)} (rods ${(100 - energy).toFixed(0)} % inserted)`);
    }
    case "setCoolantDemand": {
      const v = bounded(command.value, LIMITS.coolantDemand, "Coolant demand");
      return log({ ...state, coolantDemand: v }, `Recirculation demand set to ${v.toFixed(0)} %`);
    }
    case "setFeedwaterSetpoint": {
      const v = bounded(command.value, LIMITS.feedwaterSetpoint, "Feedwater setpoint");
      return log({ ...state, feedwaterSetpoint: v }, `Feedwater level setpoint ${v.toFixed(0)} %`);
    }
    case "setValve": {
      const v = bounded(command.value, LIMITS.valve, "Steam valve");
      return log({ ...state, valvePosition: v }, `Steam valve commanded to ${v.toFixed(0)} %`);
    }
    case "setPump":
      return log({ ...state, [command.pump === "A" ? "pumpA" : "pumpB"]: command.on }, `Recirculation pump ${command.pump} ${command.on ? "started" : "stopped"}`);
    case "setTurbine":
      return log({ ...state, turbineEnabled: command.on }, `Turbine ${command.on ? "started" : "stopped"}`);
    case "setBreaker":
      return log({ ...state, breakerClosed: command.closed }, `Generator breaker ${command.closed ? "closed" : "opened"}`);
    case "scram":
      if (state.scram) return state;
      return withEvent({ ...state, scram: true, commandedRod: 100, scramReason: command.reason }, "ALARM", `SCRAM initiated (${source}): ${command.reason}`);
    case "resetScram": {
      if (!state.scram) return state;
      if (state.powerPercent > 5) throw new CommandError("SCRAM reset blocked: reactor power must be below 5 %");
      const blocking = evaluateAlarms({ ...state, scram: false }).find((a) => a.level === "CRITICAL");
      if (blocking) throw new CommandError(`SCRAM reset blocked: ${blocking.name} still present`);
      return log({ ...state, scram: false, scramReason: "", commandedRod: 100 }, "SCRAM reset — rods remain fully inserted");
    }
    case "setPaused":
      return log({ ...state, paused: command.paused }, command.paused ? "Simulation paused" : "Simulation resumed");
    case "setSpeed": {
      if (!(SPEEDS as readonly number[]).includes(command.speed)) throw new CommandError("Unsupported simulation speed");
      return log({ ...state, speed: command.speed }, `Simulation speed set to ×${command.speed}`);
    }
    case "setSensorNoise": {
      const v = bounded(command.value, LIMITS.sensorNoise, "Sensor noise");
      return log({ ...state, sensorNoise: v }, `Sensor noise multiplier ×${v.toFixed(1)}`);
    }
    case "setFault": {
      if (state.faults[command.fault] === command.on) return state;
      return withEvent({ ...state, faults: { ...state.faults, [command.fault]: command.on } }, "FAULT", `${FAULT_LABELS[command.fault]} ${command.on ? "injected" : "cleared"}`);
    }
    case "setSeverity": {
      const v = bounded(command.value, LIMITS.severity, "Fault severity");
      return { ...state, faults: { ...state.faults, severity: v } };
    }
    case "acknowledge":
      return { ...state, alarms: state.alarms.map((a) => (a.id === command.id ? { ...a, acknowledged: true } : a)) };
    case "acknowledgeAll":
      return log({ ...state, alarms: state.alarms.map((a) => ({ ...a, acknowledged: true })) }, "All alarms acknowledged");
    case "loadScenario":
      return withEvent(scenarioState(state, command.name), "SYSTEM", `Scenario loaded: ${command.name}`);
    case "reset": {
      const fresh = initialState();
      return withEvent({ ...fresh, mode: state.mode, hilMode: state.hilMode, events: state.events }, "SYSTEM", "Simulation reset to documented initial conditions");
    }
  }
}

function scenarioState(current: ReactorState, name: ScenarioName): ReactorState {
  const fresh = initialState();
  const base: ReactorState = { ...fresh, time: current.time, speed: current.speed, mode: current.mode, hilMode: current.hilMode, events: current.events, sensorNoise: current.sensorNoise };
  switch (name) {
    case "STARTUP": return { ...base, commandedRod: 70, actualRod: 92, neutronProxy: 0.06, powerPercent: 6, thermalPower: 18, coreTemperature: 252, coolantTemperature: 243, steamFlow: 18, turbineRpm: 1030, turbinePower: 3, electricalOutput: 2.8, pressure: 6.85 };
    case "NORMAL OPERATION": return base;
    case "POWER INCREASE": return { ...base, commandedRod: 35 };
    case "POWER DECREASE": return { ...base, commandedRod: 75 };
    case "TURBINE TRIP": return { ...base, faults: { ...base.faults, turbineTrip: true } };
    case "LOSS OF SENSOR": return { ...base, faults: { ...base.faults, pressureSensor: true } };
    case "LOW WATER LEVEL": return { ...base, waterLevel: 50, feedwaterSetpoint: 55 };
    case "HIGH PRESSURE": return { ...base, valvePosition: 35 };
    case "CONTROL ROD FAILURE": return { ...base, commandedRod: 75, faults: { ...base.faults, rodFailure: true } };
    case "SCRAM": return { ...base, scram: true, commandedRod: 100, scramReason: "Scenario: operator-initiated SCRAM" };
  }
}

// ───────────────────────── Instrumentation ─────────────────────────

export function sensorsFor(state: ReactorState): SensorReading[] {
  const n = state.sensorNoise;
  const noise = (phase: number, amplitude: number) => Math.sin(state.time * 0.73 + phase) * amplitude * n + Math.sin(state.time * 2.31 + phase * 1.7) * amplitude * 0.4 * n;
  const drift = state.faults.sensorDrift ? state.faults.severity * 0.035 : 0;
  const make = (id: string, label: string, trueValue: number, unit: string, amp: number, accuracy: string, opts: { drift?: number; failed?: boolean } = {}): SensorReading => {
    const err = opts.failed ? Number.NaN : noise(id.charCodeAt(2), amp) + (opts.drift ?? 0);
    return { id, label, trueValue, value: opts.failed ? Number.NaN : trueValue + err, unit, error: err, noise: `±${(amp * 1.4 * n).toFixed(3)} ${unit}`, accuracy, health: opts.failed ? "FAILED" : opts.drift ? "DRIFT" : "GOOD" };
  };
  return [
    make("N-101", "Reactor power", state.powerPercent, "%", 0.12, "±0.25 %"),
    make("T-201", "Core temperature", state.coreTemperature, "°C", 0.18, "±0.4 °C", { drift: drift * 1.7 }),
    make("T-202", "Coolant temperature", state.coolantTemperature, "°C", 0.15, "±0.4 °C", { drift }),
    make("P-301", "Vessel pressure", state.pressure, "MPa", 0.008, "±0.02 MPa", { failed: state.faults.pressureSensor }),
    make("L-401", "Vessel water level", state.waterLevel, "%", 0.15, "±0.3 %", { failed: state.faults.levelSensor }),
    make("F-501", "Steam flow", state.steamFlow, "kg/s", 0.6, "±1.0 kg/s"),
    make("F-502", "Feedwater flow", state.feedwaterFlow, "kg/s", 0.6, "±1.0 kg/s"),
    make("S-601", "Turbine speed", state.turbineRpm, "rpm", 2.5, "±5 rpm"),
    make("E-701", "Generator output", state.electricalOutput, "MWe", 0.1, "±0.2 MWe"),
  ];
}

export function historyPoint(state: ReactorState): HistoryPoint {
  return { time: state.time, power: state.powerPercent, temperature: state.coreTemperature, pressure: state.pressure, level: state.waterLevel, steam: state.steamFlow, turbine: state.turbineRpm, electrical: state.electricalOutput, rods: state.actualRod };
}

export function systemStatus(state: ReactorState): "SIMULATION PAUSED" | "SCRAM" | "ALARM" | "WARNING" | "CAUTION" | "NORMAL" {
  if (state.paused) return "SIMULATION PAUSED";
  if (state.scram) return "SCRAM";
  if (state.alarms.some((a) => a.level === "ALARM" || a.level === "CRITICAL")) return "ALARM";
  if (state.alarms.some((a) => a.level === "WARNING")) return "WARNING";
  if (state.alarms.length) return "CAUTION";
  return "NORMAL";
}

/** Run the model forward with a fixed step — used by tests and the live validation page. */
export function runFor(state: ReactorState, seconds: number, dt = TIMESTEP_SECONDS) {
  let s = state;
  for (let t = 0; t < seconds; t += dt) s = stepSimulation(s, dt);
  return s;
}
