import { describe, expect, test } from "vitest";

import { calculateDistanceKm, distancePenalty } from "../src/services/distance";
import { proximityLabel } from "../src/services/proximity";
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

  test("returns Border for real neighboring countries", () => {
    expect(
      proximityLabel({
        distanceKm: 1300,
        guessedCountry: { alpha3: "PRT" },
        targetCountry: { alpha3: "ESP" }
      })
    ).toBe("Border");
  });

  test("does not return Border for non-neighbors even when distance is relatively short", () => {
    expect(
      proximityLabel({
        distanceKm: 1800,
        guessedCountry: { alpha3: "ITA" },
        targetCountry: { alpha3: "GRC" }
      })
    ).toBe("Hot");
  });

  test("keeps kilometer bands for non-neighboring countries", () => {
    expect(
      proximityLabel({
        distanceKm: 3500,
        guessedCountry: { alpha3: "JPN" },
        targetCountry: { alpha3: "PHL" }
      })
    ).toBe("Warm");
    expect(
      proximityLabel({
        distanceKm: 6000,
        guessedCountry: { alpha3: "JAM" },
        targetCountry: { alpha3: "IRL" }
      })
    ).toBe("Cool");
    expect(
      proximityLabel({
        distanceKm: 9000,
        guessedCountry: { alpha3: "URY" },
        targetCountry: { alpha3: "JPN" }
      })
    ).toBe("Ice Cold");
  });
});
