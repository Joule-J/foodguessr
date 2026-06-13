import type { GuessRecord, RoundRecord, SessionRecord } from "../domain";
import { countryToAreaMap } from "../data/area-map";
import {
  bearingDegrees,
  bearingDirection,
  proximityLabel
} from "./proximity";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spoilerTerms(round: RoundRecord) {
  const terms = [
    round.targetCountry.name,
    ...round.targetCountry.aliases,
    round.dish.areaRaw,
    countryToAreaMap[round.targetCountry.name]
  ]
    .filter((term): term is string => typeof term === "string" && term.trim().length > 0)
    .sort((left, right) => right.length - left.length);

  return Array.from(new Set(terms.map((term) => term.trim())));
}

function redactSpoilers(value: string, round: RoundRecord) {
  return spoilerTerms(round).reduce((current, term) => {
    const pattern = new RegExp(escapeRegExp(term), "gi");
    return current.replace(pattern, "[hidden]");
  }, value);
}

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
      title: redactSpoilers(round.dish.title, round),
      imageUrl: round.dish.imageUrl,
      imageGallery: round.dish.imageGallery,
      instructions: redactSpoilers(round.dish.instructions, round),
      ingredients: round.dish.ingredients.map((ingredient) => redactSpoilers(ingredient, round))
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
