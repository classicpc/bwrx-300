import { describe, expect, it } from "vitest";
import { CHECKS } from "./validation";
import { applyCommand, CommandError, initialState, runFor } from "./simulator";

describe("educational reactor model", () => {
  for (const check of CHECKS) {
    it(`${check.id} ${check.name}`, () => {
      const result = check.run();
      expect(result.pass, result.detail).toBe(true);
    });
  }

  it("blocks rod withdrawal while SCRAM is active", () => {
    const s = applyCommand(initialState(), { type: "scram", reason: "test" });
    expect(() => applyCommand(s, { type: "setRod", value: 10 })).toThrow(CommandError);
  });

  it("blocks SCRAM reset until power is below 5 %", () => {
    const s = applyCommand(initialState(), { type: "scram", reason: "test" });
    expect(() => applyCommand(s, { type: "resetScram" })).toThrow(CommandError);
    const cooled = runFor(s, 20);
    expect(applyCommand(cooled, { type: "resetScram" }).scram).toBe(false);
  });

  it("pausing freezes simulation time", () => {
    const s = applyCommand(initialState(), { type: "setPaused", paused: true });
    expect(runFor(s, 10).time).toBe(s.time);
  });

  it("kids energy maps to rod insertion within 10–85", () => {
    expect(applyCommand(initialState(), { type: "setEnergyLevel", value: 0 }).commandedRod).toBe(90);
    expect(applyCommand(initialState(), { type: "setEnergyLevel", value: 60 }).commandedRod).toBe(40);
  });

  it("more cooling lowers core temperature", () => {
    const low = runFor(applyCommand(initialState(), { type: "setCoolantDemand", value: 40 }), 200);
    const high = runFor(applyCommand(initialState(), { type: "setCoolantDemand", value: 100 }), 200);
    expect(low.coreTemperature).toBeGreaterThan(high.coreTemperature + 10);
  });
});
