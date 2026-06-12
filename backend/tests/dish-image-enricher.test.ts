import { describe, expect, test } from "vitest";

import { DishImageEnricher } from "../src/services/dish-image-enricher";

function mockJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload
  } as Response;
}

describe("DishImageEnricher", () => {
  test("returns strict-match gallery images and removes duplicates or unusable files", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("/search/title")) {
        return mockJsonResponse({
          pages: [
            {
              key: "Pad_thai",
              title: "Pad thai"
            }
          ]
        });
      }

      if (url.includes("/page/summary/Pad_thai")) {
        return mockJsonResponse({
          originalimage: {
            source: "https://img.test/pad-thai-main.jpg"
          },
          thumbnail: {
            source: "https://img.test/pad-thai-main.jpg"
          }
        });
      }

      if (url.includes("prop=images")) {
        return mockJsonResponse({
          query: {
            pages: [
              {
                images: [
                  { title: "File:Pad_thai_closeup.jpg" },
                  { title: "File:Ingredients for pad thai.jpg" },
                  { title: "File:Flag of Thailand.svg" },
                  { title: "File:Pad_thai_pan.png" }
                ]
              }
            ]
          }
        });
      }

      if (url.includes("prop=imageinfo")) {
        return mockJsonResponse({
          query: {
            pages: [
              {
                imageinfo: [{ url: "https://img.test/pad-thai-main.jpg" }]
              },
              {
                imageinfo: [{ url: "https://img.test/pad-thai-pan.png" }]
              }
            ]
          }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const enricher = new DishImageEnricher(
      "https://wiki.test/rest",
      "https://wiki.test/api.php",
      fetcher
    );

    const gallery = await enricher.resolveImageGallery(
      "Pad Thai",
      "https://cdn.test/mealdb-pad-thai.jpg"
    );

    expect(gallery).toEqual([
      "https://img.test/pad-thai-main.jpg",
      "https://img.test/pad-thai-pan.png"
    ]);
  });

  test("returns no gallery when exact title match is missing", async () => {
    const enricher = new DishImageEnricher(
      "https://wiki.test/rest",
      "https://wiki.test/api.php",
      (async () =>
        mockJsonResponse({
          pages: [
            {
              key: "Some_other_food",
              title: "Some other food"
            }
          ]
        })) as typeof fetch
    );

    const gallery = await enricher.resolveImageGallery(
      "Butter Chicken",
      "https://cdn.test/butter-chicken.jpg"
    );

    expect(gallery).toEqual([]);
  });
});
