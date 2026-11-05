import { describe, expect, it } from "vitest";
import { ACTIVITIES, QUIZ } from "./learning";
import { initialState } from "./simulator";

describe("science activities", () => {
  it("steam activity needs at least 150 kg/s", () => {
    const a = ACTIVITIES[0];
    expect(a.complete({ ...initialState(), steamFlow: 149 })).toBe(false);
    expect(a.complete({ ...initialState(), steamFlow: 150 })).toBe(true);
  });
  it("electricity activity needs 50 MWe", () => {
    const a = ACTIVITIES[1];
    expect(a.complete({ ...initialState(), electricalOutput: 49 })).toBe(false);
    expect(a.complete({ ...initialState(), electricalOutput: 50 })).toBe(true);
  });
  it("the quiz identifies steam as the heat carrier", () => {
    expect(QUIZ[0].options[QUIZ[0].answer]).toBe("Steam");
  });
});