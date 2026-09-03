export type QuestionType = "single" | "multiple" | "judgment";

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  stemMd: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  explanationMd: string;
}

export interface QuestionBank {
  id: string;
  title: string;
  description: string;
  version: number;
  questions: Question[];
}

export interface QuestionSummary {
  id: string;
  title: string;
  description: string;
  version: number;
  questionCount: number;
}

export interface QuestionSection {
  type: QuestionType;
  startPosition: number;
  count: number;
}

export interface QuestionPayload {
  bank: Pick<QuestionBank, "id" | "title" | "version">;
  position: number;
  total: number;
  sections: QuestionSection[];
  question: Pick<Question, "id" | "type" | "stemMd" | "options">;
}

export interface AnswerRequest {
  bankVersion: number;
  selectedOptionIds: string[];
}

export interface AnswerResult {
  isCorrect: boolean;
  correctOptionIds: string[];
  explanationMd: string;
}

export type ApiErrorCode =
  | "BANK_NOT_FOUND"
  | "POSITION_NOT_FOUND"
  | "QUESTION_NOT_FOUND"
  | "INVALID_ANSWER"
  | "BANK_VERSION_CHANGED";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export interface QuestionAttempt {
  questionId: string;
  selectedOptionIds: string[];
  result?: AnswerResult;
}

export interface ProgressEntry {
  bankVersion: number;
  currentPosition: number;
  attempts: Record<string, QuestionAttempt>;
}

export type ProgressState = Record<string, ProgressEntry>;

export interface PersistedProgress {
  schemaVersion: 2;
  banks: ProgressState;
}
