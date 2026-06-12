import type { GuessRecord, RoundRecord, SessionRecord } from "../domain";
import {
  bearingDegrees,
  bearingDirection,
  proximityLabel
} from "./proximity";

function mapGuess(guess: GuessRecord, round: RoundRecord) {
  const bearing = bearingDegrees(
    guess.guessedCountry.latitude,
    guess.guessedCountry.longitude,
    round.targetCountry.latitude,
    round.targetCountry.longitude
  );

  return {
    id: guess.id,
    countryId: guess.guessedCountry.id,
    countryName: guess.guessedCountry.name,
    distanceKm: Math.round(guess.distanceKm),
    penalty: guess.penalty,
    isCorrect: guess.isCorrect,
    proximityLabel: guess.isCorrect
      ? "Border"
      : proximityLabel({
          distanceKm: guess.distanceKm,
          guessedCountry: guess.guessedCountry,
          targetCountry: round.targetCountry
        }),
    targetBearing: guess.isCorrect ? 0 : Math.round(bearing),
    targetDirection: guess.isCorrect ? "Here" : bearingDirection(bearing)
  };
}

function currentRoundView(round: RoundRecord) {
  return {
    id: round.id,
    roundNumber: round.roundIndex + 1,
    guesses: round.guesses.map((guess) => mapGuess(guess, round)),
    dish: {
      id: round.dish.id,
      title: round.dish.title,
      imageUrl: round.dish.imageUrl,
      imageGallery: round.dish.imageGallery,
      instructions: round.dish.instructions,
      ingredients: round.dish.ingredients
    }
  };
}

function solvedRoundView(round: RoundRecord) {
  return {
    id: round.id,
    roundNumber: round.roundIndex + 1,
    dishTitle: round.dish.title,
    dishImageUrl: round.dish.imageUrl,
    countryName: round.revealCountryName ?? round.targetCountry.name,
    roundScore: round.roundScore,
    totalPenalty: round.totalPenalty,
    guessedCorrectly: round.guesses.some((guess) => guess.isCorrect)
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
