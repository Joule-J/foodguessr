export const ROUND_BASE_SCORE = 1000;

export function solvedRoundScore(totalPenalty: number): number {
  return Math.max(0, ROUND_BASE_SCORE - totalPenalty);
}
