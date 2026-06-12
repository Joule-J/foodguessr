import { describe, expect, test } from "vitest";

import { areaToCountryMap } from "../src/data/area-map";
import { countryBordersByAlpha3 } from "../src/data/country-borders";
import { createCatalogCountries } from "../src/data/country-catalog";
import { normalizeAreaToCountry } from "../src/services/normalization";

describe("country catalog border data", () => {
  test("every supported playable country has an alpha3 code", () => {
    const catalog = createCatalogCountries();

    for (const area of Object.keys(areaToCountryMap)) {
      expect(normalizeAreaToCountry(area, catalog)?.alpha3).toBeTruthy();
    }
  });

  test("every supported playable country exists in the border dataset", () => {
    const catalog = createCatalogCountries();
    const supportedAlpha3 = catalog
      .filter((country) =>
        Object.values(areaToCountryMap).some(
          (countryName) =>
            country.name === countryName || country.aliases.includes(countryName.toLowerCase())
        )
      )
      .map((country) => country.alpha3);

    for (const alpha3 of supportedAlpha3) {
      expect(countryBordersByAlpha3).toHaveProperty(alpha3);
    }
  });
});
