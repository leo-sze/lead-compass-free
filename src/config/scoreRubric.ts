// Rubrica de temperatura a partir do Score IA (0–100). Ajuste aqui.
export const SCORE_RUBRIC = {
  quente: 70,
  morno: 45,
  // abaixo de "morno" = frio
};

export function temperaturaFromScore(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= SCORE_RUBRIC.quente) return "quente";
  if (score >= SCORE_RUBRIC.morno) return "morno";
  return "frio";
}
