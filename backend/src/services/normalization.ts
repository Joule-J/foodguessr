import { areaToCountryMap } from "../data/area-map";
import type { CountryRecord } from "../domain";

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeAreaToCountry(
  area: string,
  countries: CountryRecord[]
): CountryRecord | null {
  const targetName = areaToCountryMap[area];
  if (!targetName) {
    return null;
  }

  return (
    countries.find((country) => normalizeKey(country.name) === normalizeKey(targetName)) ??
    countries.find((country) =>
      country.aliases.some((alias) => normalizeKey(alias) === normalizeKey(targetName))
    ) ??
    null
  );
}
