import type { CountryRecord, CountrySeed, DishRecord, DishSeed, SessionRecord } from "../domain";

export type DishUsageStat = {
  dishId: string;
  timesUsed: number;
  lastUsedAt: Date | null;
};

export type SessionRoundSeed = {
  roundIndex: number;
  dishId: string;
  targetCountryId: string;
};

export type GuessCreateInput = {
  sessionId: string;
  roundId: string;
  guessedCountryId: string;
  distanceKm: number;
  penalty: number;
  isCorrect: boolean;
};

export type SessionProgressUpdate = {
  sessionId: string;
  totalScore: number;
  currentRoundIndex: number;
  status: "IN_PROGRESS" | "COMPLETED";
};

export type RoundFinalizeInput = {
  roundId: string;
  totalPenalty: number;
  roundScore: number;
  revealCountryName: string;
};

export interface GameRepository {
  syncCountries(countries: CountrySeed[]): Promise<void>;
  listCountries(): Promise<CountryRecord[]>;
  getCountryById(countryId: string): Promise<CountryRecord | null>;
  upsertDishes(dishes: DishSeed[]): Promise<void>;
  listDishes(): Promise<DishRecord[]>;
  listPlayableDishes(): Promise<DishRecord[]>;
  listPlayableDishesByCountry(countryId: string): Promise<DishRecord[]>;
  listDishUsageStats(): Promise<DishUsageStat[]>;
  updateDish(
    dishId: string,
    patch: { countryId?: string; isPlayable?: boolean; needsReview?: boolean }
  ): Promise<DishRecord | null>;
  createSession(rounds: SessionRoundSeed[]): Promise<SessionRecord>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  createGuess(input: GuessCreateInput): Promise<void>;
  finalizeRound(input: RoundFinalizeInput): Promise<void>;
  updateSessionProgress(update: SessionProgressUpdate): Promise<void>;
  disconnect(): Promise<void>;
}
