import type { QuestionBank } from "../../types/quiz";

export class QuestionBankLoadError extends Error {
  readonly filePath: string;
  readonly location: string;
  readonly reason: string;
  constructor(filePath: string, location: string, reason: string);
}

export function getDefaultQuestionBankDirectory(): string;
export function loadQuestionBanks(directory?: string): QuestionBank[];
