import { describe, expect, test } from "vitest";

import { calculateDistanceKm, distancePenalty } from "../src/services/distance";
import { solvedRoundScore } from "../src/services/scoring";

describe("distance scoring", () => {
  test("penalty increases as guesses get farther away", () => {
    const near = calculateDistanceKm(41.0082, 28.9784, 39.9334, 32.8597);
    const far = calculateDistanceKm(41.0082, 28.9784, -33.8688, 151.2093);

    expect(distancePenalty(far)).toBeGreaterThan(distancePenalty(near));
  });

  test("round score floors at zero after penalties", () => {
    expect(solvedRoundScore(250)).toBe(750);
    expect(solvedRoundScore(1400)).toBe(0);
  });
});
