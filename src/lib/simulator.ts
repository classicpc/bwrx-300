export type Severity = "INFO" | "WARNING" | "ALARM" | "CRITICAL";
export type RunMode = "beginner" | "engineering";
export type HilMode = "software" | "hil-simulation";

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
  type: "OPERATOR" | "SYSTEM" | "ALARM" | "FAULT" | "HIL";
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
  pumpA: boolean;
  pumpB: boolean;
  turbineEnabled: boolean;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const approach = (value: number, target: number, rate: number) => value + (target - value) * clamp(rate, 0, 1);

export function initialState(): ReactorState {
  return {
    time: 0, paused: false, speed: 1, mode: "beginner", hilMode: "software", demoRunning: false,
    scram: false, scramReason: "", commandedRod: 58, actualRod: 58, rodMoving: "HOLD",
    neutronProxy: 0.42, reactorPeriod: 38, powerPercent: 42, thermalPower: 126,
    decayHeat: 0, coreTemperature: 278, coolantTemperature: 272, pressure: 7.08,
    waterLevel: 71, steamFlow: 126, steamTemperature: 286, turbineRpm: 1800,
    turbinePower: 40, electricalOutput: 38, frequency: 30, condenserPressure: 8.2,
    feedwaterFlow: 128, recirculationFlow: 410, valvePosition: 68,
    pumpA: true, pumpB: true, turbineEnabled: true, generatorConnected: true,
    faults: { sensorDrift: false, pressureSensor: false, levelSensor: false, pumpDegradation: false, turbineTrip: false, generatorDisconnect: false, communicationFailure: false, rodFailure: false, severity: 45 },
    alarms: [],
    events: [{ id: 1, time: 0, type: "SYSTEM", message: "Simulation initialized at stable partial power" }],
  };
}

function activeAlarm(id: string, level: Severity, name: string, description: string, value: string, threshold: string, action: string, state: ReactorState): Alarm {
  const previous = state.alarms.find((alarm) => alarm.id === id);
  return { id, level, name, description, value, threshold, action, timestamp: previous?.timestamp ?? state.time, acknowledged: previous?.acknowledged ?? false, active: true };
}

function evaluateAlarms(state: ReactorState): Alarm[] {
  const alarms: Alarm[] = [];
  if (state.scram) alarms.push(activeAlarm("scram", "CRITICAL", "REACTOR SCRAM", state.scramReason || "Protective shutdown initiated", `${state.powerPercent.toFixed(1)} %`, "Protection demand", "Observe simulated cooldown and identify the initiating condition.", state));
  if (state.powerPercent > 92) alarms.push(activeAlarm("power-high", "ALARM", "HIGH REACTOR POWER", "Simulated reactor power exceeded the training limit.", `${state.powerPercent.toFixed(1)} %`, "> 92 %", "Reduce the simulated power demand or initiate SCRAM.", state));
  if (state.pressure > 7.7) alarms.push(activeAlarm("pressure-high", state.pressure > 8.1 ? "CRITICAL" : "ALARM", "HIGH VESSEL PRESSURE", "Steam pressure is above the normal training band.", `${state.pressure.toFixed(2)} MPa`, "> 7.70 MPa", "Reduce simulated heat input and verify steam flow.", state));
  if (state.waterLevel < 48) alarms.push(activeAlarm("level-low", state.waterLevel < 35 ? "CRITICAL" : "ALARM", "LOW VESSEL WATER LEVEL", "Simulated vessel inventory is below the safe training band.", `${state.waterLevel.toFixed(1)} %`, "< 48 %", "Increase simulated feedwater and reduce power demand.", state));
  if (!state.pumpA && !state.pumpB) alarms.push(activeAlarm("cooling-loss", "CRITICAL", "LOSS OF RECIRCULATION", "Both simulated coolant pumps are unavailable.", "0 pumps", "At least 1 required", "Restore a virtual pump or initiate SCRAM.", state));
  if (state.faults.pressureSensor || state.faults.levelSensor) alarms.push(activeAlarm("sensor-failure", "WARNING", "INSTRUMENT CHANNEL FAILURE", "One or more virtual sensor channels are unavailable.", "INVALID", "Healthy channel", "Compare redundant true-value diagnostics in Engineering mode.", state));
  if (state.faults.communicationFailure) alarms.push(activeAlarm("hil-comms", "WARNING", "HIL COMMUNICATION LOSS", "The educational hardware link is unavailable; virtual I/O remains active.", "DISCONNECTED", "Connected", "Continue in software-only mode or reset the virtual link.", state));
  if (state.faults.turbineTrip) alarms.push(activeAlarm("turbine-trip", "ALARM", "TURBINE TRIP", "The turbine has tripped and steam demand is falling.", `${state.turbineRpm.toFixed(0)} rpm`, "Trip signal", "Observe pressure response and reduce simulated power.", state));
  if (state.faults.rodFailure) alarms.push(activeAlarm("rod-failure", "ALARM", "CONTROL ROD MOTION FAILURE", "Actual rod position is not following the command.", `${Math.abs(state.commandedRod - state.actualRod).toFixed(1)} % mismatch`, "> 3 %", "Hold power changes and reset the injected fault.", state));
  return alarms;
}

export function stepSimulation(input: ReactorState, dtSeconds: number): ReactorState {
  if (input.paused) return input;
  const dt = clamp(dtSeconds, 0.01, 0.25);
  let state = { ...input, faults: { ...input.faults }, time: input.time + dt * input.speed };
  const effectiveDt = dt * input.speed;

  if (state.scram) state.commandedRod = 100;
  const rodDelta = state.commandedRod - state.actualRod;
  const rodRate = state.scram ? 35 : 3.2;
  if (state.faults.rodFailure) state.rodMoving = "FAILED";
  else if (Math.abs(rodDelta) < 0.05) state.rodMoving = "HOLD";
  else {
    state.actualRod = clamp(state.actualRod + Math.sign(rodDelta) * Math.min(Math.abs(rodDelta), rodRate * effectiveDt), 0, 100);
    state.rodMoving = rodDelta > 0 ? "INSERTING" : "WITHDRAWING";
  }

  const pumpFactor = ((state.pumpA ? 0.5 : 0) + (state.pumpB ? 0.5 : 0)) * (state.faults.pumpDegradation ? 1 - state.faults.severity / 140 : 1);
  const reactivityDemand = clamp((100 - state.actualRod) / 42, 0, 1.35);
  const targetPower = state.scram ? 0 : clamp(100 * reactivityDemand * (0.78 + 0.22 * pumpFactor), 0, 110);
  state.neutronProxy = approach(state.neutronProxy, targetPower / 100, (state.scram ? 0.9 : 0.12) * effectiveDt);
  state.powerPercent = clamp(approach(state.powerPercent, state.neutronProxy * 100, (state.scram ? 0.75 : 0.08) * effectiveDt), 0, 110);
  state.reactorPeriod = clamp(70 / Math.max(0.08, Math.abs(targetPower - state.powerPercent)), 2, 999);
  state.decayHeat = state.scram ? approach(state.decayHeat, Math.max(1.8, state.powerPercent * 0.07), 0.08 * effectiveDt) : approach(state.decayHeat, 0, 0.15 * effectiveDt);
  state.thermalPower = clamp(state.powerPercent * 3 + state.decayHeat * 3, 0, 330);

  state.recirculationFlow = clamp(approach(state.recirculationFlow, 520 * pumpFactor, 0.18 * effectiveDt), 0, 560);
  const coreTarget = 258 + state.powerPercent * 0.62 - pumpFactor * 8;
  state.coreTemperature = clamp(approach(state.coreTemperature, coreTarget, 0.035 * effectiveDt), 20, 340);
  state.coolantTemperature = clamp(approach(state.coolantTemperature, state.coreTemperature - 7 - 5 * pumpFactor, 0.08 * effectiveDt), 20, 325);
  const steamTarget = clamp(state.powerPercent * 3.1 * pumpFactor, 0, 340);
  state.steamFlow = approach(state.steamFlow, steamTarget * state.valvePosition / 100, 0.07 * effectiveDt);
  state.steamTemperature = clamp(approach(state.steamTemperature, 268 + state.powerPercent * 0.5, 0.04 * effectiveDt), 20, 320);
  const pressureTarget = 6.15 + state.powerPercent * 0.016 - state.valvePosition * 0.004 + (state.faults.turbineTrip ? 0.55 : 0);
  state.pressure = clamp(approach(state.pressure, pressureTarget, 0.055 * effectiveDt), 0.1, 8.6);
  state.feedwaterFlow = clamp(approach(state.feedwaterFlow, state.steamFlow + (70 - state.waterLevel) * 3, 0.09 * effectiveDt), 0, 360);
  state.waterLevel = clamp(state.waterLevel + (state.feedwaterFlow - state.steamFlow) * 0.003 * effectiveDt, 0, 100);

  const turbineAvailable = state.turbineEnabled && !state.faults.turbineTrip;
  const rpmTarget = turbineAvailable && state.steamFlow > 4 ? clamp(state.steamFlow / 300 * 3600, 0, 3600) : 0;
  state.turbineRpm = clamp(approach(state.turbineRpm, rpmTarget, (rpmTarget > state.turbineRpm ? 0.05 : 0.12) * effectiveDt), 0, 3800);
  state.turbinePower = clamp(approach(state.turbinePower, state.steamFlow * 0.88 * (state.turbineRpm / 3600), 0.07 * effectiveDt), 0, 300);
  state.generatorConnected = !state.faults.generatorDisconnect && state.generatorConnected;
  state.electricalOutput = approach(state.electricalOutput, state.generatorConnected ? state.turbinePower * 0.96 : 0, 0.1 * effectiveDt);
  state.frequency = clamp(state.turbineRpm / 60, 0, 63.3);
  state.condenserPressure = clamp(approach(state.condenserPressure, 7.2 + state.steamFlow * 0.014, 0.08 * effectiveDt), 3, 16);

  const nextAlarms = evaluateAlarms(state);
  const critical = nextAlarms.find((alarm) => alarm.level === "CRITICAL" && alarm.id !== "scram");
  if (critical && !state.scram) {
    state.scram = true;
    state.scramReason = `Automatic protection: ${critical.name}`;
    state.events = [{ id: Date.now(), time: state.time, type: "ALARM", message: state.scramReason }, ...state.events].slice(0, 100);
  }
  state.alarms = evaluateAlarms(state);
  return state;
}

export function sensorsFor(state: ReactorState): SensorReading[] {
  const deterministicNoise = (phase: number, amplitude: number) => Math.sin(state.time * 0.73 + phase) * amplitude;
  const drift = state.faults.sensorDrift ? state.faults.severity * 0.035 : 0;
  return [
    { id: "N-101", label: "Reactor power", trueValue: state.powerPercent, value: state.powerPercent + deterministicNoise(1, 0.12) + drift, unit: "%", error: deterministicNoise(1, 0.12) + drift, accuracy: "±0.25%", health: state.faults.sensorDrift ? "DRIFT" : "GOOD" },
    { id: "T-201", label: "Core temperature", trueValue: state.coreTemperature, value: state.coreTemperature + deterministicNoise(2, 0.18) + drift * 1.7, unit: "°C", error: deterministicNoise(2, 0.18) + drift * 1.7, accuracy: "±0.4°C", health: state.faults.sensorDrift ? "DRIFT" : "GOOD" },
    { id: "P-301", label: "Vessel pressure", trueValue: state.pressure, value: state.faults.pressureSensor ? Number.NaN : state.pressure + deterministicNoise(3, 0.008), unit: "MPa", error: state.faults.pressureSensor ? Number.NaN : deterministicNoise(3, 0.008), accuracy: "±0.02 MPa", health: state.faults.pressureSensor ? "FAILED" : "GOOD" },
    { id: "L-401", label: "Vessel level", trueValue: state.waterLevel, value: state.faults.levelSensor ? Number.NaN : state.waterLevel + deterministicNoise(4, 0.15), unit: "%", error: state.faults.levelSensor ? Number.NaN : deterministicNoise(4, 0.15), accuracy: "±0.3%", health: state.faults.levelSensor ? "FAILED" : "GOOD" },
  ];
}

export function historyPoint(state: ReactorState): HistoryPoint {
  return { time: state.time, power: state.powerPercent, temperature: state.coreTemperature, pressure: state.pressure, level: state.waterLevel, steam: state.steamFlow, turbine: state.turbineRpm, electrical: state.electricalOutput, rods: state.actualRod };
}
