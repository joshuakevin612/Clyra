import { describe, expect, it } from "vitest";
import { cursorDamping, dampingAlpha } from "./damping";
describe("cinematic cursor damping", () => {
  it("uses the requested k and converges identically across frame rates", () => {
    expect(cursorDamping).toBe(0.0003);
    const simulate = (fps: number) => {
      let x = 0;
      for (let i = 0; i < fps; i++) x += (1000 - x) * dampingAlpha(1000 / fps);
      return x;
    };
    expect(simulate(30)).toBeCloseTo(simulate(60), 10);
    expect(simulate(60)).toBeCloseTo(simulate(144), 10);
    expect(simulate(60)).toBeCloseTo(1000 * (1 - 0.0003), 10);
    expect(dampingAlpha(1000)).toBe(dampingAlpha(50));
    expect(dampingAlpha(0)).toBe(0);
    expect(dampingAlpha(-10)).toBe(0);
  });
});
