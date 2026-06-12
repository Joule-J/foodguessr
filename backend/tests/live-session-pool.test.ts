import { describe, expect, test } from "vitest";
import request from "supertest";

import { createServer } from "../src/server";

function mockJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload
  } as Response;
}

describe("live API match pool", () => {
  test("new sessions are built from live random meals when enabled", async () => {
    const meals = [
      ["100", "Italian", "Carbonara"],
      ["101", "Mexican", "Tacos"],
      ["102", "Thai", "Pad Thai"],
      ["103", "Indian", "Butter Chicken"],
      ["104", "Canadian", "Poutine"],
      ["105", "Japanese", "Sushi"]
    ];
    let index = 0;

    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/random.php")) {
        const [idMeal, strArea, strMeal] = meals[index % meals.length]!;
        index += 1;

        return mockJsonResponse({
          meals: [
            {
              idMeal,
              strMeal,
              strArea,
              strInstructions: `Cook ${strMeal}`,
              strMealThumb: `https://cdn.test/${idMeal}.jpg`,
              strIngredient1: "Ingredient",
              strMeasure1: "1"
            }
          ]
        });
      }

      if (url.includes("/search/title")) {
        return mockJsonResponse({ pages: [] });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const { app } = await createServer({
      fetcher,
      configOverrides: {
        databaseUrl: undefined,
        liveMealDbSessionImportEnabled: true,
        mealDbBaseUrl: "https://example.test/api"
      }
    });

    const createResponse = await request(app).post("/api/sessions");

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.roundCount).toBe(5);
    expect(
      ["Carbonara", "Tacos", "Pad Thai", "Butter Chicken", "Poutine", "Sushi"]
    ).toContain(createResponse.body.currentRound.dish.title);
    expect(createResponse.body.currentRound.dish.imageUrl).toContain("https://cdn.test/");
    expect(Array.isArray(createResponse.body.currentRound.dish.imageGallery)).toBe(true);
  });

  test("falls back when live API cannot provide enough valid meals", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/random.php")) {
        return mockJsonResponse({
          meals: [
            {
              idMeal: "900",
              strMeal: "Unknown Meal",
              strArea: "Unknown",
              strInstructions: "Cook it",
              strMealThumb: ""
            }
          ]
        });
      }

      if (url.includes("/search/title")) {
        return mockJsonResponse({ pages: [] });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const { app } = await createServer({
      fetcher,
      configOverrides: {
        databaseUrl: undefined,
        liveMealDbSessionImportEnabled: true,
        mealDbBaseUrl: "https://example.test/api"
      }
    });

    const createResponse = await request(app).post("/api/sessions");

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.roundCount).toBe(5);
    expect(createResponse.body.currentRound.dish.imageUrl).toContain("themealdb.com/images/media/meals");
  });
});
