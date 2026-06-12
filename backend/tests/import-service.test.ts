import { describe, expect, test } from "vitest";

import { createCatalogCountries } from "../src/data/country-catalog";
import { InMemoryRepository } from "../src/repositories/in-memory-repository";
import { ImportService } from "../src/services/import-service";

function mockJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload
  } as Response;
}

describe("ImportService live match pool", () => {
  test("accepts supported random meals and rejects unsupported, imageless, and duplicate entries", async () => {
    const repository = new InMemoryRepository();
    await repository.syncCountries(createCatalogCountries());

    let calls = 0;
    const service = new ImportService(
      repository,
      "https://example.test/api",
      (async () => {
        calls += 1;

        if (calls === 1) {
          return mockJsonResponse({
            meals: [
              {
                idMeal: "1",
                strMeal: "Carbonara",
                strArea: "Italian",
                strInstructions: "Cook it",
                strMealThumb: "https://cdn.test/1.jpg",
                strIngredient1: "Pasta",
                strMeasure1: "200g"
              }
            ]
          });
        }

        if (calls === 2) {
          return mockJsonResponse({
            meals: [
              {
                idMeal: "1",
                strMeal: "Carbonara",
                strArea: "Italian",
                strInstructions: "Cook it",
                strMealThumb: "https://cdn.test/1.jpg"
              }
            ]
          });
        }

        if (calls === 3) {
          return mockJsonResponse({
            meals: [
              {
                idMeal: "2",
                strMeal: "Mystery",
                strArea: "Unknown",
                strInstructions: "Cook it",
                strMealThumb: "https://cdn.test/2.jpg"
              }
            ]
          });
        }

        if (calls === 4) {
          return mockJsonResponse({
            meals: [
              {
                idMeal: "3",
                strMeal: "No Image",
                strArea: "Mexican",
                strInstructions: "Cook it",
                strMealThumb: ""
              }
            ]
          });
        }

        return mockJsonResponse({
          meals: [
            {
              idMeal: "4",
              strMeal: "Tacos",
              strArea: "Mexican",
              strInstructions: "Cook it",
              strMealThumb: "https://cdn.test/4.jpg",
              strIngredient1: "Tortilla",
              strMeasure1: "4"
            }
          ]
        });
      }) as typeof fetch
    );

    const imported = await service.importRandomMatchMeals({
      targetCount: 2,
      maxAttempts: 10,
      excludedMealDbIds: new Set()
    });

    expect(imported.map((meal) => meal.mealDbId)).toEqual(["1", "4"]);
    expect(imported.every((meal) => meal.imageUrl)).toBe(true);
  });
});
