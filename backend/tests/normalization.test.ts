import { describe, expect, test } from "vitest";

import type { CountryRecord } from "../src/domain";
import { normalizeAreaToCountry } from "../src/services/normalization";

const countries: CountryRecord[] = [
  {
    id: "it",
    name: "Italy",
    iso2: "IT",
    latitude: 42.5,
    longitude: 12.5,
    aliases: []
  },
  {
    id: "us",
    name: "United States",
    iso2: "US",
    latitude: 39,
    longitude: -98,
    aliases: []
  }
];

describe("normalizeAreaToCountry", () => {
  test("maps known MealDB areas to canonical countries", () => {
    expect(normalizeAreaToCountry("Italian", countries)?.name).toBe("Italy");
    expect(normalizeAreaToCountry("American", countries)?.name).toBe(
      "United States"
    );
  });

  test("rejects unsupported areas", () => {
    expect(normalizeAreaToCountry("Unknown", countries)).toBeNull();
  });
});
