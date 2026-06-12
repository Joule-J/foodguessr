import { randomUUID } from "node:crypto";

import type {
  CountryRecord,
  CountrySeed,
  DishRecord,
  DishSeed,
  GuessRecord,
  RoundRecord,
  SessionRecord
} from "../domain";
import type {
  GameRepository,
  DishUsageStat,
  GuessCreateInput,
  RoundFinalizeInput,
  SessionProgressUpdate,
  SessionRoundSeed
} from "./types";

type InMemoryDish = Omit<DishRecord, "country">;
type InMemoryGuess = Omit<GuessRecord, "guessedCountry">;
type InMemoryRound = Omit<RoundRecord, "dish" | "targetCountry" | "guesses"> & {
  createdAt: Date;
  dishId: string;
  targetCountryId: string;
  guesses: InMemoryGuess[];
};
type InMemorySession = Omit<SessionRecord, "rounds"> & { rounds: InMemoryRound[] };

export class InMemoryRepository implements GameRepository {
  private countries = new Map<string, CountryRecord>();
  private dishes = new Map<string, InMemoryDish>();
  private sessions = new Map<string, InMemorySession>();

  async syncCountries(countries: CountrySeed[]) {
    for (const country of countries) {
      const existing = Array.from(this.countries.values()).find(
        (item) => item.iso2 === country.iso2
      );
      const id = existing?.id ?? randomUUID();
      this.countries.set(id, { id, ...country });
    }
  }

  async listCountries() {
    return Array.from(this.countries.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  async getCountryById(countryId: string) {
    return this.countries.get(countryId) ?? null;
  }

  async upsertDishes(dishes: DishSeed[]) {
    for (const dish of dishes) {
      const existing = Array.from(this.dishes.values()).find(
        (item) => item.mealDbId === dish.mealDbId
      );
      const id = existing?.id ?? randomUUID();
      this.dishes.set(id, { id, ...dish });
    }
  }

  async listDishes() {
    return Array.from(this.dishes.values()).map((dish) => this.inflateDish(dish));
  }

  async listPlayableDishes() {
    return (await this.listDishes()).filter((dish) => dish.isPlayable && !dish.needsReview);
  }

  async listPlayableDishesByCountry(countryId: string) {
    return (await this.listPlayableDishes()).filter((dish) => dish.countryId === countryId);
  }

  async listDishUsageStats(): Promise<DishUsageStat[]> {
    const usageByDish = new Map<string, DishUsageStat>();

    for (const session of this.sessions.values()) {
      for (const round of session.rounds) {
        const existing = usageByDish.get(round.dishId) ?? {
          dishId: round.dishId,
          timesUsed: 0,
          lastUsedAt: null
        };

        existing.timesUsed += 1;

        if (!existing.lastUsedAt || round.createdAt > existing.lastUsedAt) {
          existing.lastUsedAt = round.createdAt;
        }

        usageByDish.set(round.dishId, existing);
      }
    }

    return Array.from(usageByDish.values());
  }

  async updateDish(
    dishId: string,
    patch: { countryId?: string; isPlayable?: boolean; needsReview?: boolean }
  ) {
    const dish = this.dishes.get(dishId);
    if (!dish) {
      return null;
    }

    const updated = { ...dish, ...patch };
    this.dishes.set(dishId, updated);
    return this.inflateDish(updated);
  }

  async createSession(rounds: SessionRoundSeed[]) {
    const sessionId = randomUUID();
    const session: InMemorySession = {
      id: sessionId,
      status: "IN_PROGRESS",
      totalScore: 0,
      currentRoundIndex: 0,
      rounds: rounds.map((round) => ({
        id: randomUUID(),
        roundIndex: round.roundIndex,
        status: "IN_PROGRESS",
        totalPenalty: 0,
        roundScore: 0,
        createdAt: new Date(),
        dishId: round.dishId,
        targetCountryId: round.targetCountryId,
        guesses: []
      }))
    };

    this.sessions.set(sessionId, session);
    return this.inflateSession(session);
  }

  async getSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session ? this.inflateSession(session) : null;
  }

  async createGuess(input: GuessCreateInput) {
    const session = this.sessions.get(input.sessionId);
    const round = session?.rounds.find((item) => item.id === input.roundId);
    if (!session || !round) {
      return;
    }

    round.guesses.push({
      id: randomUUID(),
      sessionId: input.sessionId,
      roundId: input.roundId,
      guessedCountryId: input.guessedCountryId,
      distanceKm: input.distanceKm,
      penalty: input.penalty,
      isCorrect: input.isCorrect,
      createdAt: new Date()
    });
  }

  async finalizeRound(input: RoundFinalizeInput) {
    for (const session of this.sessions.values()) {
      const round = session.rounds.find((item) => item.id === input.roundId);
      if (!round) {
        continue;
      }

      round.status = "SOLVED";
      round.totalPenalty = input.totalPenalty;
      round.roundScore = input.roundScore;
      round.revealCountryName = input.revealCountryName;
      round.solvedAt = new Date();
      return;
    }
  }

  async updateSessionProgress(update: SessionProgressUpdate) {
    const session = this.sessions.get(update.sessionId);
    if (!session) {
      return;
    }

    session.totalScore = update.totalScore;
    session.currentRoundIndex = update.currentRoundIndex;
    session.status = update.status;
  }

  async disconnect() {}

  private inflateDish(dish: InMemoryDish): DishRecord {
    const country = this.countries.get(dish.countryId);
    if (!country) {
      throw new Error(`Missing country ${dish.countryId} for dish ${dish.id}`);
    }

    return {
      ...dish,
      country
    };
  }

  private inflateSession(session: InMemorySession): SessionRecord {
    return {
      ...session,
      rounds: session.rounds.map((round) => {
        const dish = this.dishes.get(round.dishId);
        const targetCountry = this.countries.get(round.targetCountryId);

        if (!dish || !targetCountry) {
          throw new Error(`Round ${round.id} is missing dish or country data.`);
        }

        return {
          id: round.id,
          roundIndex: round.roundIndex,
          status: round.status,
          totalPenalty: round.totalPenalty,
          roundScore: round.roundScore,
          revealCountryName: round.revealCountryName,
          solvedAt: round.solvedAt,
          dish: this.inflateDish(dish),
          targetCountry,
          guesses: round.guesses.map((guess) => {
            const guessedCountry = this.countries.get(guess.guessedCountryId);
            if (!guessedCountry) {
              throw new Error(`Missing guessed country ${guess.guessedCountryId}`);
            }

            return {
              ...guess,
              guessedCountry
            };
          })
        };
      })
    };
  }
}
