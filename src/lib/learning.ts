import type { ReactorState } from "./simulator";

export const PARTS = [
  { id: "reactor", title: "Reactor", explanation: "The core makes heat. Water carries that heat away and turns into steam." },
  { id: "rods", title: "Control rods", explanation: "These rods absorb neutrons. Moving them further in reduces the heat being made." },
  { id: "steam", title: "Steam separator", explanation: "Steam is separated from liquid water before travelling to the turbine." },
  { id: "turbine", title: "Turbine & generator", explanation: "Steam turns the turbine. The connected generator turns that motion into electricity." },
  { id: "condenser", title: "Condenser", explanation: "Steam cools back into liquid water so it can be used again." },
  { id: "water", title: "Water pump", explanation: "The pump returns water to the vessel. Cooling and water supply keep the heat cycle balanced." },
] as const;

export const ACTIVITIES = [
  { id: "steam", title: "How does steam work?", goal: "Reach 150 kg/s of steam.", complete: (s: ReactorState) => s.steamFlow >= 150 },
  { id: "energy", title: "Make electricity", goal: "Reach 50 MWe of electricity.", complete: (s: ReactorState) => s.electricalOutput >= 50 },
  { id: "cool", title: "Keep it cool", goal: "Use at least 90% cooling and bring the core below 274°C.", complete: (s: ReactorState) => s.coolantDemand >= 90 && s.coreTemperature < 274 },
  { id: "water", title: "Balance the water", goal: "Bring the water level between 74% and 76%.", complete: (s: ReactorState) => s.waterLevel >= 74 && s.waterLevel <= 76 },
  { id: "turbine", title: "Stop and restart", goal: "Stop the turbine, restart it, then reach 2,000 rpm.", complete: (s: ReactorState) => s.turbineEnabled && s.turbineRpm >= 2000 },
] as const;

export const QUIZ = [
  { question: "What carries heat from the reactor to the turbine?", options: ["Steam", "Control rods", "Electric wires"], answer: 0 },
  { question: "What happens when control rods move further in?", options: ["More heat", "Less heat", "Nothing changes"], answer: 1 },
  { question: "What turns turbine motion into electricity?", options: ["Condenser", "Water pump", "Generator"], answer: 2 },
  { question: "What does the condenser do?", options: ["Makes fuel", "Turns steam back into water", "Moves control rods"], answer: 1 },
  { question: "After a safety shutdown, does heat disappear instantly?", options: ["Yes", "No, some heat remains", "Only at night"], answer: 1 },
] as const;