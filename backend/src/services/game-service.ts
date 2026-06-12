import { demoMeals } from "../data/demo-dishes";
import type { DishSeed, SessionRecord } from "../domain";
import { HttpError } from "../lib/errors";
import type { GameRepository } from "../repositories/types";
import { calculateDistanceKm, distancePenalty } from "./distance";
import { normalizeAreaToCountry } from "./normalization";
import { solvedRoundScore } from "./scoring";
import { createSessionView } from "./session-view";

const DEFAULT_ROUND_COUNT = 5;

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

export class GameService {
  constructor(private readonly repository: GameRepository) {}

  async bootstrapCatalog() {
    const countries = await this.repository.listCountries();
    const dishes = await this.repository.listDishes();

    if (dishes.length > 0) {
      return;
    }

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
    const dishes = await this.repository.listPlayableDishes();

    if (dishes.length < DEFAULT_ROUND_COUNT) {
      throw new HttpError(
        409,
        "Not enough playable dishes. Import data first or seed demo dishes."
      );
    }

    const selectedRounds = shuffle(dishes)
      .slice(0, DEFAULT_ROUND_COUNT)
      .map((dish, index) => ({
        roundIndex: index,
        dishId: dish.id,
        targetCountryId: dish.countryId
      }));

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
      correct: false,
      distanceKm: Math.round(distanceKm),
      penalty,
      scoreDelta: 0,
      revealCountry: null as string | null
    };

    if (isCorrect) {
      const updatedSession = await this.requireSession(sessionId);
      const solvedRound = updatedSession.rounds.find((item) => item.id === round.id);

      if (!solvedRound) {
        throw new HttpError(500, "Round state missing after guess.");
      }

      const totalPenalty = solvedRound.guesses.reduce((sum, guess) => sum + guess.penalty, 0);
      const roundScore = solvedRoundScore(totalPenalty);
      const nextRoundIndex = solvedRound.roundIndex + 1;
      const isSessionComplete = nextRoundIndex >= updatedSession.rounds.length;

      await this.repository.finalizeRound({
        roundId: solvedRound.id,
        totalPenalty,
        roundScore,
        revealCountryName: solvedRound.targetCountry.name
      });

      await this.repository.updateSessionProgress({
        sessionId,
        totalScore: updatedSession.totalScore + roundScore,
        currentRoundIndex: nextRoundIndex,
        status: isSessionComplete ? "COMPLETED" : "IN_PROGRESS"
      });

      guessResult = {
        correct: true,
        distanceKm: 0,
        penalty: 0,
        scoreDelta: roundScore,
        revealCountry: solvedRound.targetCountry.name
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
}
