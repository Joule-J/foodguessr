export type CountryOption = {
  id: string;
  name: string;
  iso2: string;
  flagUrl: string;
};

export type SessionView = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  totalScore: number;
  currentRoundIndex: number;
  roundCount: number;
  completedRounds: number;
  currentRound: {
    id: string;
    roundNumber: number;
    debugCountryName: string;
    guesses: Array<{
      id: string;
      countryId: string;
      countryName: string;
      distanceKm: number;
      penalty: number;
      isCorrect: boolean;
    }>;
    dish: {
      id: string;
      imageUrl: string;
      instructions: string;
      ingredients: string[];
    };
  } | null;
  solvedRounds: Array<{
    id: string;
    roundNumber: number;
    countryName: string;
    roundScore: number;
    totalPenalty: number;
  }>;
};

export type GuessResponse = {
  session: SessionView;
  guessResult: {
    correct: boolean;
    distanceKm: number;
    penalty: number;
    scoreDelta: number;
    revealCountry: string | null;
  };
};
