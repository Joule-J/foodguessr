import { countryToAreaMap } from "../data/area-map";
import type { CountryRecord, DishSeed } from "../domain";
import type { GameRepository } from "../repositories/types";
import { normalizeAreaToCountry } from "./normalization";

type MealDbMeal = {
  idMeal: string;
  strMeal: string;
  strArea: string;
  strInstructions: string;
  strMealThumb: string;
  [key: string]: string | null | undefined;
};

type MealDbLetterResponse = {
  meals: MealDbMeal[] | null;
};

type MealDbAreaMeal = {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
};

type MealDbAreaResponse = {
  meals: MealDbAreaMeal[] | null;
};

type MealDbLookupResponse = {
  meals: MealDbMeal[] | null;
};

export type RandomMatchImportInput = {
  targetCount: number;
  maxAttempts: number;
  excludedMealDbIds: Set<string>;
};

function extractIngredients(meal: MealDbMeal): string[] {
  const ingredients: string[] = [];

  for (let index = 1; index <= 20; index += 1) {
    const ingredient = meal[`strIngredient${index}`]?.trim();
    const measure = meal[`strMeasure${index}`]?.trim();

    if (!ingredient) {
      continue;
    }

    ingredients.push([measure, ingredient].filter(Boolean).join(" "));
  }

  return ingredients;
}

function hasUsableImage(meal: MealDbMeal): boolean {
  return typeof meal.strMealThumb === "string" && meal.strMealThumb.trim().length > 0;
}

export class ImportService {
  constructor(
    private readonly repository: GameRepository,
    private readonly mealDbBaseUrl: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async importThemealdb() {
    const countries = await this.repository.listCountries();
    const imported: DishSeed[] = [];
    const quarantined: Array<{ mealDbId: string; title: string; areaRaw: string }> = [];

    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      const response = await this.fetcher(`${this.mealDbBaseUrl}/search.php?f=${letter}`);
      const payload = (await response.json()) as MealDbLetterResponse;

      for (const meal of payload.meals ?? []) {
        const normalizedSeed = this.normalizeMealToDishSeed(meal, countries);

        if (!normalizedSeed) {
          quarantined.push({
            mealDbId: meal.idMeal,
            title: meal.strMeal,
            areaRaw: meal.strArea
          });
          continue;
        }

        imported.push(normalizedSeed);
      }
    }

    await this.repository.upsertDishes(imported);

    return {
      imported: imported.length,
      quarantined
    };
  }

  async importCountryMeals(country: CountryRecord) {
    const area = countryToAreaMap[country.name];

    if (!area) {
      return { imported: 0, area: null as string | null };
    }

    const response = await this.fetcher(`${this.mealDbBaseUrl}/filter.php?a=${encodeURIComponent(area)}`);
    const payload = (await response.json()) as MealDbAreaResponse;
    const imported: DishSeed[] = [];

    for (const summary of payload.meals ?? []) {
      const detailsResponse = await this.fetcher(
        `${this.mealDbBaseUrl}/lookup.php?i=${encodeURIComponent(summary.idMeal)}`
      );
      const detailsPayload = (await detailsResponse.json()) as MealDbLookupResponse;
      const meal = detailsPayload.meals?.[0];

      if (!meal) {
        continue;
      }

      if (!hasUsableImage(meal)) {
        continue;
      }

      imported.push({
        mealDbId: meal.idMeal,
        title: meal.strMeal,
        areaRaw: meal.strArea,
        imageUrl: meal.strMealThumb,
        instructions: meal.strInstructions,
        ingredients: extractIngredients(meal),
        isPlayable: true,
        needsReview: false,
        countryId: country.id
      });
    }

    if (imported.length > 0) {
      await this.repository.upsertDishes(imported);
    }

    return {
      imported: imported.length,
      area
    };
  }

  async importRandomMatchMeals(input: RandomMatchImportInput) {
    const countries = await this.repository.listCountries();
    const selected = new Map<string, DishSeed>();
    let attempts = 0;

    while (selected.size < input.targetCount && attempts < input.maxAttempts) {
      const batchSize = Math.min(5, input.maxAttempts - attempts);
      const responses = await Promise.all(
        Array.from({ length: batchSize }, () => this.fetchRandomMeal())
      );

      attempts += batchSize;

      for (const meal of responses) {
        if (!meal) {
          continue;
        }

        if (input.excludedMealDbIds.has(meal.idMeal) || selected.has(meal.idMeal)) {
          continue;
        }

        const seed = this.normalizeMealToDishSeed(meal, countries);

        if (!seed) {
          continue;
        }

        selected.set(seed.mealDbId, seed);

        if (selected.size >= input.targetCount) {
          break;
        }
      }
    }

    const imported = [...selected.values()];

    if (imported.length > 0) {
      await this.repository.upsertDishes(imported);
    }

    return imported;
  }

  private async fetchRandomMeal() {
    const response = await this.fetcher(`${this.mealDbBaseUrl}/random.php`);

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as MealDbLookupResponse;
    return payload.meals?.[0] ?? null;
  }

  private normalizeMealToDishSeed(
    meal: MealDbMeal,
    countries: CountryRecord[]
  ): DishSeed | null {
    if (!hasUsableImage(meal)) {
      return null;
    }

    const normalizedCountry = normalizeAreaToCountry(meal.strArea, countries);

    if (!normalizedCountry) {
      return null;
    }

    return {
      mealDbId: meal.idMeal,
      title: meal.strMeal,
      areaRaw: meal.strArea,
      imageUrl: meal.strMealThumb,
      instructions: meal.strInstructions,
      ingredients: extractIngredients(meal),
      isPlayable: true,
      needsReview: false,
      countryId: normalizedCountry.id
    };
  }
}
