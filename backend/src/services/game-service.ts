import { demoMeals } from "../data/demo-dishes";
import type { DishSeed, SessionRecord } from "../domain";
import { HttpError } from "../lib/errors";
import type { GameRepository } from "../repositories/types";
import type { DishUsageStat } from "../repositories/types";
import type { ImportService } from "./import-service";
import { calculateDistanceKm, distancePenalty } from "./distance";
import { normalizeAreaToCountry } from "./normalization";
import { bearingDegrees, bearingDirection, proximityLabel } from "./proximity";
import { solvedRoundScore } from "./scoring";
import { createSessionView } from "./session-view";

const DEFAULT_ROUND_COUNT = 5;
const MAX_GUESSES_PER_ROUND = 5;
const LIVE_MATCH_TARGET_POOL_SIZE = 10;
const LIVE_MATCH_MAX_ATTEMPTS = 50;
const RECENT_DISH_BLACKLIST_SIZE = 50;

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

export class GameService {
  constructor(
    private readonly repository: GameRepository,
    private readonly importService?: ImportService
  ) {}

  async bootstrapCatalog() {
    const countries = await this.repository.listCountries();

    const playableSeeds = demoMeals
      .flatMap((meal) => {
        const country = normalizeAreaToCountry(meal.areaRaw, countries);

        if (!country) {
          return [];
        }

        return [
          {
            ...meal,
            isPlayable: true,
            needsReview: false,
            countryId: country.id
          } satisfies DishSeed
        ];
      });

    if (playableSeeds.length > 0) {
      await this.repository.upsertDishes(playableSeeds);
    }
  }

  async createSession() {
    const selectedRounds = await this.buildSessionRounds();

    if (selectedRounds.length < DEFAULT_ROUND_COUNT) {
      throw new HttpError(
        409,
        "Not enough playable dishes. Import data first or seed demo dishes."
      );
    }

    const session = await this.repository.createSession(selectedRounds);
    return createSessionView(session);
  }

  async getSession(sessionId: string) {
    const session = await this.requireSession(sessionId);
    return createSessionView(session);
  }

  async listCountries() {
    return this.repository.listCountries();
  }

  async listDishes() {
    return this.repository.listDishes();
  }

  async updateDish(
    dishId: string,
    patch: { countryId?: string; isPlayable?: boolean; needsReview?: boolean }
  ) {
    const dish = await this.repository.updateDish(dishId, patch);

    if (!dish) {
      throw new HttpError(404, "Dish not found.");
    }

    return dish;
  }

  async submitGuess(sessionId: string, guessedCountryId: string) {
    const session = await this.requireSession(sessionId);

    if (session.status === "COMPLETED") {
      throw new HttpError(409, "This session is already complete.");
    }

    const round = session.rounds.find(
      (item) => item.roundIndex === session.currentRoundIndex && item.status === "IN_PROGRESS"
    );

    if (!round) {
      throw new HttpError(409, "No active round found.");
    }

    const guessedCountry = await this.repository.getCountryById(guessedCountryId);

    if (!guessedCountry) {
      throw new HttpError(400, "Unknown country.");
    }

    const alreadyGuessed = round.guesses.some(
      (guess) => guess.guessedCountryId === guessedCountryId
    );

    if (alreadyGuessed) {
      throw new HttpError(409, "Country already guessed in this round.");
    }

    const distanceKm = calculateDistanceKm(
      guessedCountry.latitude,
      guessedCountry.longitude,
      round.targetCountry.latitude,
      round.targetCountry.longitude
    );
    const targetBearing = bearingDegrees(
      guessedCountry.latitude,
      guessedCountry.longitude,
      round.targetCountry.latitude,
      round.targetCountry.longitude
    );
    const isCorrect = guessedCountry.id === round.targetCountry.id;
    const penalty = isCorrect ? 0 : distancePenalty(distanceKm);

    await this.repository.createGuess({
      sessionId,
      roundId: round.id,
      guessedCountryId,
      distanceKm,
      penalty,
      isCorrect
    });

    let guessResult = {
      roundId: round.id,
      correct: false,
      roundEnded: false,
      exhausted: false,
      distanceKm: Math.round(distanceKm),
      penalty,
      scoreDelta: 0,
      revealCountry: null as string | null,
      dishTitle: round.dish.title,
      dishImageUrl: round.dish.imageUrl,
      proximityLabel: isCorrect
        ? "Border"
        : proximityLabel({
            distanceKm,
            guessedCountry,
            targetCountry: round.targetCountry
          }),
      targetBearing: isCorrect ? 0 : Math.round(targetBearing),
      targetDirection: isCorrect ? "Here" : bearingDirection(targetBearing)
    };

    const roundAfterGuess = await this.requireSession(sessionId);
    const updatedRound = roundAfterGuess.rounds.find((item) => item.id === round.id);

    if (!updatedRound) {
      throw new HttpError(500, "Round state missing after guess.");
    }

    const exhausted = !isCorrect && updatedRound.guesses.length >= MAX_GUESSES_PER_ROUND;

    if (isCorrect || exhausted) {
      const totalPenalty = updatedRound.guesses.reduce((sum, guess) => sum + guess.penalty, 0);
      const roundScore = isCorrect ? solvedRoundScore(totalPenalty) : 0;
      const nextRoundIndex = updatedRound.roundIndex + 1;
      const isSessionComplete = nextRoundIndex >= roundAfterGuess.rounds.length;

      await this.repository.finalizeRound({
        roundId: updatedRound.id,
        totalPenalty,
        roundScore,
        revealCountryName: updatedRound.targetCountry.name
      });

      await this.repository.updateSessionProgress({
        sessionId,
        totalScore: roundAfterGuess.totalScore + roundScore,
        currentRoundIndex: nextRoundIndex,
        status: isSessionComplete ? "COMPLETED" : "IN_PROGRESS"
      });

      guessResult = {
        roundId: updatedRound.id,
        correct: isCorrect,
        roundEnded: true,
        exhausted,
        distanceKm: isCorrect ? 0 : Math.round(distanceKm),
        penalty,
        scoreDelta: roundScore,
        revealCountry: updatedRound.targetCountry.name,
        dishTitle: updatedRound.dish.title,
        dishImageUrl: updatedRound.dish.imageUrl,
        proximityLabel: isCorrect
          ? "Border"
          : proximityLabel({
              distanceKm,
              guessedCountry,
              targetCountry: updatedRound.targetCountry
            }),
        targetBearing: isCorrect ? 0 : Math.round(targetBearing),
        targetDirection: isCorrect ? "Here" : bearingDirection(targetBearing)
      };
    }

    const freshSession = await this.requireSession(sessionId);

    return {
      session: createSessionView(freshSession),
      guessResult
    };
  }

  private async requireSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.repository.getSession(sessionId);

    if (!session) {
      throw new HttpError(404, "Session not found.");
    }

    return session;
  }

  private async buildSessionRounds() {
    const usageStats = await this.repository.listDishUsageStats();
    const usageByDishId = new Map(usageStats.map((item) => [item.dishId, item]));
    const allDishes = await this.repository.listDishes();
    const dishById = new Map(allDishes.map((dish) => [dish.id, dish]));
    const recentDishIds = new Set(
      [...usageStats]
        .filter((item) => item.lastUsedAt)
        .sort((left, right) => (right.lastUsedAt?.getTime() ?? 0) - (left.lastUsedAt?.getTime() ?? 0))
        .slice(0, RECENT_DISH_BLACKLIST_SIZE)
        .map((item) => item.dishId)
    );
    const recentMealDbIds = new Set(
      [...recentDishIds]
        .map((dishId) => dishById.get(dishId)?.mealDbId)
        .filter((mealDbId): mealDbId is string => Boolean(mealDbId))
    );
    const selectedDishIds = new Set<string>();
    const rounds: Array<{ roundIndex: number; dishId: string; targetCountryId: string }> = [];
    const liveRounds = await this.buildLiveRounds({
      usageByDishId,
      recentDishIds,
      recentMealDbIds,
      selectedDishIds
    });
    rounds.push(...liveRounds);

    if (rounds.length >= DEFAULT_ROUND_COUNT) {
      return rounds;
    }

    const fallbackPool = await this.repository.listPlayableDishes();
    const demoMealIds = new Set(demoMeals.map((meal) => meal.mealDbId));
    const nonDemoFallbackPool = fallbackPool.filter((dish) => !demoMealIds.has(dish.mealDbId));

    while (rounds.length < DEFAULT_ROUND_COUNT) {
      const dish = this.pickDishFromPool(
        nonDemoFallbackPool,
        usageByDishId,
        recentDishIds,
        selectedDishIds
      );

      if (!dish) {
        break;
      }

      selectedDishIds.add(dish.id);
      rounds.push({
        roundIndex: rounds.length,
        dishId: dish.id,
        targetCountryId: dish.countryId
      });
    }

    if (rounds.length < DEFAULT_ROUND_COUNT) {
      const demoPool = fallbackPool.filter((dish) => demoMealIds.has(dish.mealDbId));

      while (rounds.length < DEFAULT_ROUND_COUNT) {
        const dish = this.pickDishFromPool(
          demoPool,
          usageByDishId,
          new Set<string>(),
          selectedDishIds
        );

        if (!dish) {
          break;
        }

        selectedDishIds.add(dish.id);
        rounds.push({
          roundIndex: rounds.length,
          dishId: dish.id,
          targetCountryId: dish.countryId
        });
      }
    }

    return rounds;
  }

  private async buildLiveRounds(input: {
    usageByDishId: Map<string, DishUsageStat>;
    recentDishIds: Set<string>;
    recentMealDbIds: Set<string>;
    selectedDishIds: Set<string>;
  }) {
    const rounds: Array<{ roundIndex: number; dishId: string; targetCountryId: string }> = [];
    const selectedCountryIds = new Set<string>();

    if (!this.importService) {
      return rounds;
    }

    let importedSeeds: DishSeed[] = [];

    try {
      importedSeeds = await this.importService.importRandomMatchMeals({
        targetCount: LIVE_MATCH_TARGET_POOL_SIZE,
        maxAttempts: LIVE_MATCH_MAX_ATTEMPTS,
        excludedMealDbIds: input.recentMealDbIds
      });
    } catch (error) {
      console.warn("Failed to resolve live match meals", error);
    }

    const playableDishes = await this.repository.listPlayableDishes();
    const importedMealDbIds = new Set(importedSeeds.map((seed) => seed.mealDbId));
    const liveCandidates = playableDishes.filter(
      (dish) =>
        importedMealDbIds.has(dish.mealDbId) &&
        !input.recentDishIds.has(dish.id) &&
        !input.selectedDishIds.has(dish.id) &&
        !input.recentMealDbIds.has(dish.mealDbId)
    );
    const prioritized = this.prioritizeUniqueCountries(liveCandidates, input.usageByDishId);

    for (const dish of prioritized) {
      if (rounds.length >= DEFAULT_ROUND_COUNT) {
        break;
      }

      if (!selectedCountryIds.has(dish.countryId)) {
        input.selectedDishIds.add(dish.id);
        selectedCountryIds.add(dish.countryId);
        rounds.push({
          roundIndex: rounds.length,
          dishId: dish.id,
          targetCountryId: dish.countryId
        });
      }
    }

    for (const dish of prioritized) {
      if (rounds.length >= DEFAULT_ROUND_COUNT) {
        break;
      }

      if (input.selectedDishIds.has(dish.id)) {
        continue;
      }

      input.selectedDishIds.add(dish.id);
      rounds.push({
        roundIndex: rounds.length,
        dishId: dish.id,
        targetCountryId: dish.countryId
      });
    }

    return rounds;
  }

  private pickDishFromPool(
    dishes: Awaited<ReturnType<GameRepository["listPlayableDishes"]>>,
    usageByDishId: Map<string, DishUsageStat>,
    recentDishIds: Set<string>,
    selectedDishIds: Set<string>
  ) {
    const candidates = dishes.filter((dish) => !selectedDishIds.has(dish.id));

    if (candidates.length === 0) {
      return null;
    }

    const freshCandidates = candidates.filter((dish) => !recentDishIds.has(dish.id));
    const selectionPool = freshCandidates.length > 0 ? freshCandidates : candidates;
    const weightedCandidates = selectionPool.map((dish) => {
      const usage = usageByDishId.get(dish.id);
      const usageWeight = 1 / Math.pow((usage?.timesUsed ?? 0) + 1, 1.7);

      return {
        dish,
        weight: usageWeight
      };
    });
    const totalWeight = weightedCandidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let selection = Math.random() * totalWeight;

    for (const candidate of weightedCandidates) {
      selection -= candidate.weight;

      if (selection <= 0) {
        return candidate.dish;
      }
    }

    return weightedCandidates[weightedCandidates.length - 1]?.dish ?? null;
  }

  private prioritizeUniqueCountries(
    dishes: Awaited<ReturnType<GameRepository["listPlayableDishes"]>>,
    usageByDishId: Map<string, DishUsageStat>
  ) {
    const weighted = [...dishes]
      .map((dish) => ({
        dish,
        usage: usageByDishId.get(dish.id)?.timesUsed ?? 0,
        random: Math.random()
      }))
      .sort((left, right) => {
        if (left.usage !== right.usage) {
          return left.usage - right.usage;
        }

        return left.random - right.random;
      })
      .map((item) => item.dish);

    const uniqueCountryFirst: typeof weighted = [];
    const rest: typeof weighted = [];
    const countryIds = new Set<string>();

    for (const dish of weighted) {
      if (countryIds.has(dish.countryId)) {
        rest.push(dish);
        continue;
      }

      countryIds.add(dish.countryId);
      uniqueCountryFirst.push(dish);
    }

    return [...uniqueCountryFirst, ...rest];
  }
}
