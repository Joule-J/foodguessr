import worldCountries from "world-countries";

import type { CountrySeed } from "../domain";

function uniqueAliases(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toLowerCase())
    )
  );
}

function extraAliases(countryName: string): string[] {
  if (countryName === "Türkiye") {
    return ["Turkey"];
  }

  return [];
}

export function createCatalogCountries(): CountrySeed[] {
  return worldCountries
    .filter((country) => country.independent && country.cca2 && country.latlng.length >= 2)
    .map((country) => {
      const translatedNames = Object.values(country.translations ?? {}).flatMap(
        (translation) => [translation.common, translation.official].filter(Boolean)
      );

      return {
        name: country.name.common,
        iso2: country.cca2,
        alpha3: country.cca3,
        latitude: country.latlng[0],
        longitude: country.latlng[1],
        aliases: uniqueAliases([
          country.name.common,
          country.name.official,
          ...extraAliases(country.name.common),
          ...(country.altSpellings ?? []),
          ...translatedNames
        ])
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
