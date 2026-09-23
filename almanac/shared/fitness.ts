// Strength math shared by the server (PR detection) and the client (live hints).

/** Epley estimated one-rep max. Returns null when the estimate is unreliable. */
export function estimate1RM(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (!weight || !reps || weight <= 0 || reps <= 0) return null;
  if (reps === 1) return weight;
  if (reps > 15) return null;
  return weight * (1 + reps / 30);
}

/** Weights are stored in kg; compare with a tolerance so unit round-trips never fake a PR. */
export const KG_EPSILON = 0.05;

export function heavier(a: number, b: number): boolean {
  return a - b > KG_EPSILON;
}

export function setVolume(weight: number | null | undefined, reps: number | null | undefined): number {
  return (weight ?? 0) * (reps ?? 0);
}
