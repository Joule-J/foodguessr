export type CountryRecord = {
  id: string;
  name: string;
  iso2: string;
  latitude: number;
  longitude: number;
  aliases: string[];
};

export type DishRecord = {
  id: string;
  mealDbId: string;
  title: string;
  areaRaw: string;
  imageUrl: string;
  instructions: string;
  ingredients: string[];
  isPlayable: boolean;
  needsReview: boolean;
  countryId: string;
  country: CountryRecord;
};

export type GuessRecord = {
  id: string;
  sessionId: string;
  roundId: string;
  distanceKm: number;
  penalty: number;
  isCorrect: boolean;
  guessedCountryId: string;
  guessedCountry: CountryRecord;
  createdAt: Date;
};

export type RoundRecord = {
  id: string;
  roundIndex: number;
  status: "IN_PROGRESS" | "SOLVED";
  totalPenalty: number;
  roundScore: number;
  revealCountryName?: string;
  solvedAt?: Date;
  dish: DishRecord;
  targetCountry: CountryRecord;
  guesses: GuessRecord[];
};

export type SessionRecord = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  totalScore: number;
  currentRoundIndex: number;
  rounds: RoundRecord[];
};

export type CountrySeed = Omit<CountryRecord, "id">;

export type DishSeed = {
  mealDbId: string;
  title: string;
  areaRaw: string;
  imageUrl: string;
  instructions: string;
  ingredients: string[];
  isPlayable: boolean;
  needsReview: boolean;
  countryId: string;
};
