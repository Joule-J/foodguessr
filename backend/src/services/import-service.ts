import type { DishSeed } from "../domain";
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
        const normalizedCountry = normalizeAreaToCountry(meal.strArea, countries);

        if (!normalizedCountry) {
          quarantined.push({
            mealDbId: meal.idMeal,
            title: meal.strMeal,
            areaRaw: meal.strArea
          });
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
          countryId: normalizedCountry.id
        });
      }
    }

    await this.repository.upsertDishes(imported);

    return {
      imported: imported.length,
      quarantined
    };
  }
}
