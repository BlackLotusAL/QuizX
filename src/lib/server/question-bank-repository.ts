import "server-only";

import type {
  AnswerResult,
  Question,
  QuestionBank,
  QuestionPayload,
  QuestionSummary,
} from "@/types/quiz";
import { loadQuestionBanks } from "@/lib/server/question-bank-loader.mjs";

const titleCollator = new Intl.Collator("zh-CN");

export class QuestionBankRepository {
  private readonly banksById: Map<string, QuestionBank>;
  private readonly summaries: QuestionSummary[];

  constructor(banks: QuestionBank[]) {
    this.banksById = new Map(banks.map((bank) => [bank.id, bank]));
    this.summaries = banks
      .map((bank) => ({
        id: bank.id,
        title: bank.title,
        description: bank.description,
        version: bank.version,
        questionCount: bank.questions.length,
      }))
      .sort((left, right) => titleCollator.compare(left.title, right.title));
  }

  getSummaries(): QuestionSummary[] {
    return this.summaries.map((summary) => ({ ...summary }));
  }

  getBank(bankId: string): QuestionBank | undefined {
    return this.banksById.get(bankId);
  }

  getQuestion(bankId: string, questionId: string): Question | undefined {
    return this.banksById
      .get(bankId)
      ?.questions.find((question) => question.id === questionId);
  }

  getQuestionPayload(bankId: string, position: number): QuestionPayload | undefined {
    const bank = this.banksById.get(bankId);
    const question = bank?.questions[position - 1];

    if (!bank || !question) {
      return undefined;
    }

    return {
      bank: { id: bank.id, title: bank.title, version: bank.version },
      position,
      total: bank.questions.length,
      question: {
        id: question.id,
        type: question.type,
        stemMd: question.stemMd,
        options: question.options.map((option) => ({ ...option })),
      },
    };
  }

  grade(question: Question, selectedOptionIds: string[]): AnswerResult {
    const selected = new Set(selectedOptionIds);
    const isCorrect =
      selected.size === question.correctOptionIds.length &&
      question.correctOptionIds.every((optionId) => selected.has(optionId));

    return {
      isCorrect,
      correctOptionIds: [...question.correctOptionIds],
      explanationMd: question.explanationMd,
    };
  }
}

const globalRepository = globalThis as typeof globalThis & {
  __quizxQuestionBankRepository?: QuestionBankRepository;
};

export function initializeQuestionBankRepository(): QuestionBankRepository {
  if (!globalRepository.__quizxQuestionBankRepository) {
    globalRepository.__quizxQuestionBankRepository = new QuestionBankRepository(
      loadQuestionBanks(),
    );
  }
  return globalRepository.__quizxQuestionBankRepository;
}

export function getQuestionBankRepository(): QuestionBankRepository {
  return initializeQuestionBankRepository();
}

export function clearQuestionBankRepositoryForTests(): void {
  if (process.env.NODE_ENV === "test") {
    delete globalRepository.__quizxQuestionBankRepository;
  }
}
