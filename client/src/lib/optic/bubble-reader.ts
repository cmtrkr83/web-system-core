import type { OpticAreaConfig, QuestionAnswer, BubbleScore } from "./types";
import { getBubbleCenterPixels } from "./grid-positions";
import { getLuminance } from "./image-utils";

const LETTERS_4 = ["A", "B", "C", "D"];
const LETTERS_5 = ["A", "B", "C", "D", "E"];

const MIN_FILL_RATIO = 0.08; // Lowered for better pencil mark detection
const MULTIPLE_MARK_RATIO = 0.82;
const WEAK_CONFIDENCE_GAP = 0.08;

export function readAreaBubbles(imageData: ImageData, area: OpticAreaConfig): QuestionAnswer[] {
  const { width, height, data } = imageData;
  const letters = area.optionCount === 5 ? LETTERS_5 : LETTERS_4;
  const answers: QuestionAnswer[] = [];

  for (let row = 0; row < area.questionCount; row++) {
    const scores: BubbleScore[] = [];

    for (let col = 0; col < area.optionCount; col++) {
      const { cx, cy, radius } = getBubbleCenterPixels(width, height, area, row, col);
      const score = scoreBubbleFill(data, width, height, cx, cy, radius);
      scores.push({ letter: letters[col], score });
    }

    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const second = sorted[1] ?? { letter: "", score: 0 };
    const rowBackground = Math.min(...scores.map((s) => s.score));
    const effectiveTop = top.score - rowBackground;

    let answer = "";
    let status: QuestionAnswer["status"] = "blank";
    let confidence = 0;

    if (effectiveTop >= MIN_FILL_RATIO) {
      if (second.score >= top.score * MULTIPLE_MARK_RATIO) {
        answer = "*";
        status = "multiple";
        confidence = effectiveTop;
      } else {
        answer = top.letter;
        status = "ok";
        confidence = top.score > 0 ? (top.score - second.score) / top.score : 0;
        if (confidence < WEAK_CONFIDENCE_GAP) status = "weak";
      }
    }

    answers.push({
      questionNumber: row + 1,
      answer,
      confidence: Math.round(confidence * 1000) / 1000,
      scores,
      status,
    });
  }

  return answers;
}

function scoreBubbleFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): number {
  let dark = 0;
  let total = 0;
  const r2 = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = Math.round(cx + dx);
      const y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;

      total++;
      const idx = (y * width + x) * 4;
      const lum = getLuminance(data[idx], data[idx + 1], data[idx + 2]);
      if (lum < 140) dark++;
    }
  }

  return total ? dark / total : 0;
}

export function computeAreaAlignmentScore(answers: QuestionAnswer[]): number {
  if (!answers.length) return 0;
  const valid = answers.filter((a) => a.status === "ok" || a.status === "weak");
  const avgConfidence = valid.reduce((sum, a) => sum + a.confidence, 0) / Math.max(valid.length, 1);
  const readableRatio = answers.filter((a) => a.answer !== "").length / answers.length;
  return Math.round((avgConfidence * 0.6 + readableRatio * 0.4) * 1000) / 1000;
}
