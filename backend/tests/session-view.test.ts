import { describe, expect, test } from "vitest";

import type { RoundRecord, SessionRecord } from "../src/domain";
import { createSessionView } from "../src/services/session-view";

function buildRound(): RoundRecord {
  return {
    id: "round-1",
    roundIndex: 0,
    status: "IN_PROGRESS",
    totalPenalty: 0,
    roundScore: 0,
    dish: {
      id: "dish-1",
      mealDbId: "meal-1",
      title: "Indian Butter Chicken",
      areaRaw: "Indian",
      imageUrl: "https://cdn.test/butter.jpg",
      imageGallery: [],
      instructions: "Serve this Indian classic with rice in India.",
      ingredients: ["Indian spice mix", "Chicken", "Butter"],
      isPlayable: true,
      needsReview: false,
      countryId: "country-1",
      country: {
        id: "country-1",
        name: "India",
        iso2: "IN",
        alpha3: "IND",
        latitude: 20,
        longitude: 77,
        aliases: ["india", "republic of india"]
      }
    },
    targetCountry: {
      id: "country-1",
      name: "India",
      iso2: "IN",
      alpha3: "IND",
      latitude: 20,
      longitude: 77,
      aliases: ["india", "republic of india"]
    },
    guesses: []
  };
}

describe("createSessionView", () => {
  test("redacts country spoiler terms from the current round dish fields", () => {
    const session: SessionRecord = {
      id: "session-1",
      status: "IN_PROGRESS",
      totalScore: 0,
      currentRoundIndex: 0,
      rounds: [buildRound()]
    };

    const view = createSessionView(session);
    const dish = view.currentRound?.dish;

    expect(dish).toBeTruthy();
    expect(dish?.title).not.toMatch(/india|indian/i);
    expect(dish?.instructions).not.toMatch(/india|indian/i);
    expect(dish?.ingredients.join(" ")).not.toMatch(/india|indian/i);
    expect(dish?.title).not.toContain("[hidden]");
    expect(dish?.title).toBe("Butter Chicken");
    expect(dish?.instructions).toBe("Serve this classic with rice in.");
    expect(dish?.ingredients).toEqual(["spice mix", "Chicken", "Butter"]);
  });
});
