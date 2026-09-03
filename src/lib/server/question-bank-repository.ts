import "server-only";

import type {
  AnswerResult,
  Question,
  QuestionBank,
  QuestionPayload,
  QuestionSection,
  QuestionSummary,
} from "@/types/quiz";
import { loadQuestionBanks } from "@/lib/server/question-bank-loader.mjs";
import { QUESTION_TYPE_ORDER } from "@/lib/question-types";

const titleCollator = new Intl.Collator("zh-CN");

export class QuestionBankRepository {
  private readonly banksById: Map<string, QuestionBank>;
  private readonly orderedQuestionsByBankId: Map<string, Question[]>;
  private readonly sectionsByBankId: Map<string, QuestionSection[]>;
  private readonly summaries: QuestionSummary[];

  constructor(banks: QuestionBank[]) {
    this.banksById = new Map(banks.map((bank) => [bank.id, bank]));
    this.orderedQuestionsByBankId = new Map();
    this.sectionsByBankId = new Map();

    for (const bank of banks) {
      const orderedQuestions = QUESTION_TYPE_ORDER.flatMap((type) =>
        bank.questions.filter((question) => question.type === type),
      );
      let startPosition = 1;
      const sections = QUESTION_TYPE_ORDER.flatMap<QuestionSection>((type) => {
        const count = orderedQuestions.filter((question) => question.type === type).length;
        if (count === 0) {
          return [];
        }
        const section = { type, startPosition, count };
        startPosition += count;
        return [section];
      });

      this.orderedQuestionsByBankId.set(bank.id, orderedQuestions);
      this.sectionsByBankId.set(bank.id, sections);
    }

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
    const orderedQuestions = this.orderedQuestionsByBankId.get(bankId);
    const question = orderedQuestions?.[position - 1];

    if (!bank || !orderedQuestions || !question) {
      return undefined;
    }

    return {
      bank: { id: bank.id, title: bank.title, version: bank.version },
      position,
      total: orderedQuestions.length,
      sections: (this.sectionsByBankId.get(bankId) ?? []).map((section) => ({ ...section })),
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
