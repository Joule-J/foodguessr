import request from "supertest";
import { beforeAll, describe, expect, test } from "vitest";

import { createServer } from "../src/server";

let app: Awaited<ReturnType<typeof createServer>>["app"];

beforeAll(async () => {
  const serverBundle = await createServer();
  app = serverBundle.app;
});

describe("session routes", () => {
  test("create session, guess wrong, then solve without leaking answer", async () => {
    const createResponse = await request(app).post("/api/sessions");
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.currentRound.dish).not.toHaveProperty("countryName");

    const sessionId = createResponse.body.id as string;
    const dishImageUrl = createResponse.body.currentRound.dish.imageUrl as string;

    const countriesResponse = await request(app).get("/api/countries");
    const countries = countriesResponse.body as Array<{ id: string; name: string }>;

    const dishesResponse = await request(app).get("/api/admin/dishes");
    const currentDish = dishesResponse.body.find(
      (dish: { imageUrl: string; country: { id: string } }) => dish.imageUrl === dishImageUrl
    ) as { country: { id: string } };

    const wrongCountry = countries.find((country) => country.id !== currentDish.country.id);
    expect(wrongCountry).toBeTruthy();

    const wrongGuessResponse = await request(app)
      .post(`/api/sessions/${sessionId}/guesses`)
      .send({ countryId: wrongCountry?.id });

    expect(wrongGuessResponse.status).toBe(200);
    expect(wrongGuessResponse.body.guessResult.correct).toBe(false);
    expect(wrongGuessResponse.body.guessResult.revealCountry).toBeNull();

    const correctGuessResponse = await request(app)
      .post(`/api/sessions/${sessionId}/guesses`)
      .send({ countryId: currentDish.country.id });

    expect(correctGuessResponse.status).toBe(200);
    expect(correctGuessResponse.body.guessResult.correct).toBe(true);
    expect(correctGuessResponse.body.guessResult.revealCountry).toBeTruthy();
  });

  test("returns 404 for missing session", async () => {
    const response = await request(app).get("/api/sessions/missing");
    expect(response.status).toBe(404);
  });
});
