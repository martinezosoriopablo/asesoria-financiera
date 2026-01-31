// src/lib/risk/risk_scoring.ts

import {
  RISK_QUESTIONNAIRE_V1,
  RiskQuestion
} from "./risk_questionnaire_v1";

export type AnswerMap = Record<string, any>;

export interface RiskScores {
  capacity: number;
  tolerance: number;
  perception: number;
  composure: number;
  global: number;
  profileLabel: string;
}

const avg = (arr: number[]): number =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

function mapScoreToLabel(score: number): string {
  if (score < 20) return "Ultra Conservador";
  if (score < 35) return "Conservador";
  if (score < 50) return "Moderado";
  if (score < 70) return "Crecimiento";
  if (score < 85) return "Agresivo";
  return "Muy Agresivo";
}

export function calculateRiskScores(answers: AnswerMap): RiskScores {
  const capacityScores: number[] = [];
  const toleranceScores: number[] = [];
  const perceptionScores: number[] = [];
  const composureScores: number[] = [];
  // validationScores podríamos usarlo después como check, por ahora no lo mezclo

  for (const question of RISK_QUESTIONNAIRE_V1) {
    const ans = answers[question.id];
    if (ans === undefined || ans === null) continue;

    if (question.type === "single_choice") {
      const opt = question.options?.find((o) => o.value === ans);
      if (!opt) continue;
      const s = opt.score;

      switch (question.dimension) {
        case "capacity":
          capacityScores.push(s);
          break;
        case "perception":
          perceptionScores.push(s);
          break;
        case "composure":
          composureScores.push(s);
          break;
        case "validation":
          // más adelante podríamos usarlo para ajustar
          break;
      }
    }

    if (question.type === "likert_1_5") {
      const raw = Number(ans); // 1..5
      if (!raw || raw < 1 || raw > 5) continue;

      const reverse = (question as any).reverse ?? false;
      const mapped = reverse ? 5 - raw : raw - 1; // 0..4
      const score = (mapped / 4) * 100; // 0..100

      if (question.dimension === "tolerance") {
        toleranceScores.push(score);
      }
    }
  }

  const capacity = avg(capacityScores);
  const tolerance = avg(toleranceScores);
  const perception = avg(perceptionScores);
  const composure = avg(composureScores);

  const global =
    0.3 * capacity +
    0.4 * tolerance +
    0.1 * perception +
    0.2 * composure;

  const profileLabel = mapScoreToLabel(global);

  return {
    capacity,
    tolerance,
    perception,
    composure,
    global,
    profileLabel
  };
}
