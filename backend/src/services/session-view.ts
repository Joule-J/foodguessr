import type { GuessRecord, RoundRecord, SessionRecord } from "../domain";

function mapGuess(guess: GuessRecord) {
  return {
    id: guess.id,
    countryId: guess.guessedCountry.id,
    countryName: guess.guessedCountry.name,
    distanceKm: Math.round(guess.distanceKm),
    penalty: guess.penalty,
    isCorrect: guess.isCorrect
  };
}

function currentRoundView(round: RoundRecord) {
  return {
    id: round.id,
    roundNumber: round.roundIndex + 1,
    debugCountryName: round.targetCountry.name,
    guesses: round.guesses.map(mapGuess),
    dish: {
      id: round.dish.id,
      imageUrl: round.dish.imageUrl,
      instructions: round.dish.instructions,
      ingredients: round.dish.ingredients
    }
  };
}

function solvedRoundView(round: RoundRecord) {
  return {
    id: round.id,
    roundNumber: round.roundIndex + 1,
    countryName: round.revealCountryName ?? round.targetCountry.name,
    roundScore: round.roundScore,
    totalPenalty: round.totalPenalty
  };
}

export function createSessionView(session: SessionRecord) {
  const currentRound = session.rounds.find(
    (round) => round.roundIndex === session.currentRoundIndex && round.status === "IN_PROGRESS"
  );

  return {
    id: session.id,
    status: session.status,
    totalScore: session.totalScore,
    currentRoundIndex: session.currentRoundIndex,
    roundCount: session.rounds.length,
    completedRounds: session.rounds.filter((round) => round.status === "SOLVED").length,
    currentRound: currentRound ? currentRoundView(currentRound) : null,
    solvedRounds: session.rounds
      .filter((round) => round.status === "SOLVED")
      .map(solvedRoundView)
  };
}
