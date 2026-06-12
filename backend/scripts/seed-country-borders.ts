import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { supportedMealDbCountries } from "../src/data/area-map";
import { createCatalogCountries } from "../src/data/country-catalog";

type RestCountry = {
  name?: { common?: string };
  cca3?: string;
  borders?: string[];
};

async function main() {
  const apiKey = process.env.RESTCOUNTRIES_API_KEY;

  if (!apiKey) {
    throw new Error("RESTCOUNTRIES_API_KEY is required for the border seed step.");
  }

  const response = await fetch("https://restcountries.com/v5/all?fields=name,cca3,borders", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`REST Countries request failed: ${response.status} ${response.statusText}`);
  }

  const countries = (await response.json()) as RestCountry[];
  const supportedAlpha3 = new Set(
    createCatalogCountries()
      .filter((country) => supportedMealDbCountries.includes(country.name))
      .map((country) => country.alpha3)
  );

  const borders = Object.fromEntries(
    countries
      .filter(
        (country) =>
          country.cca3 &&
          country.name?.common &&
          supportedAlpha3.has(country.cca3)
      )
      .map((country) => [
        country.cca3 as string,
        (country.borders ?? []).filter((border) => supportedAlpha3.has(border)).sort()
      ])
      .sort(([left], [right]) => left.localeCompare(right))
  );

  const outputPath = resolve(process.cwd(), "src/data/country-borders.generated.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(borders, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
