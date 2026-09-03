// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import { GET as getBanks } from "@/app/api/banks/route";
import { GET as getQuestion } from "@/app/api/banks/[bankId]/questions/[questionKey]/route";
import { POST as postAnswer } from "@/app/api/banks/[bankId]/questions/[questionKey]/answer/route";
import {
  clearQuestionBankRepositoryForTests,
  QuestionBankRepository,
} from "@/lib/server/question-bank-repository";
import type { QuestionBank } from "@/types/quiz";

beforeEach(() => clearQuestionBankRepositoryForTests());

function answerRequest(body: unknown): Request {
  return new Request("http://localhost/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("question bank API routes", () => {
  it("returns sorted summaries without question content", async () => {
    const response = getBanks();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual([
      {
        id: "javascript-basics",
        title: "JavaScript 基础",
        description: "通过六道题复习 JavaScript 的类型、比较、数组与 JSON 基础。",
        version: 2,
        questionCount: 6,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("correctOptionIds");
  });

  it("sorts repository summaries by Chinese title", () => {
    const baseQuestion: QuestionBank["questions"][number] = {
      id: "q1",
      type: "single",
      stemMd: "题目",
      options: [{ id: "A", text: "A" }, { id: "B", text: "B" }],
      correctOptionIds: ["A"],
      explanationMd: "解析",
    };
    const repository = new QuestionBankRepository([
      { id: "z", title: "中文", description: "描述", version: 1, questions: [baseQuestion] },
      { id: "a", title: "阿尔法", description: "描述", version: 1, questions: [baseQuestion] },
    ]);

    expect(repository.getSummaries().map((bank) => bank.title)).toEqual(["阿尔法", "中文"]);
  });

  it("derives a stable practice order and omits empty type sections", () => {
    function question(id: string, type: QuestionBank["questions"][number]["type"]): QuestionBank["questions"][number] {
      return {
        id,
        type,
        stemMd: id,
        options: [{ id: "A", text: "A" }, { id: "B", text: "B" }],
        correctOptionIds: type === "multiple" ? ["A", "B"] : ["A"],
        explanationMd: "解析",
      };
    }
    const repository = new QuestionBankRepository([{
      id: "mixed",
      title: "混合",
      description: "描述",
      version: 1,
      questions: [
        question("multiple-1", "multiple"),
        question("single-1", "single"),
        question("judgment-1", "judgment"),
        question("single-2", "single"),
      ],
    }]);

    expect([1, 2, 3, 4].map((position) =>
      repository.getQuestionPayload("mixed", position)?.question.id,
    )).toEqual(["single-1", "single-2", "judgment-1", "multiple-1"]);
    expect(repository.getQuestionPayload("mixed", 1)?.sections).toEqual([
      { type: "single", startPosition: 1, count: 2 },
      { type: "judgment", startPosition: 3, count: 1 },
      { type: "multiple", startPosition: 4, count: 1 },
    ]);

    const singleOnly = new QuestionBankRepository([{
      id: "single-only",
      title: "单选",
      description: "描述",
      version: 1,
      questions: [question("single", "single")],
    }]);
    expect(singleOnly.getQuestionPayload("single-only", 1)?.sections).toEqual([
      { type: "single", startPosition: 1, count: 1 },
    ]);
  });

  it("returns a safe question payload and rejects invalid positions", async () => {
    const response = await getQuestion(new Request("http://localhost"), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.question.id).toBe("q001");
    expect(body.sections).toEqual([
      { type: "single", startPosition: 1, count: 2 },
      { type: "judgment", startPosition: 3, count: 2 },
      { type: "multiple", startPosition: 5, count: 2 },
    ]);
    expect(body).not.toHaveProperty("question.correctOptionIds");
    expect(body).not.toHaveProperty("question.explanationMd");

    const judgment = await getQuestion(new Request("http://localhost"), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "3" }),
    });
    expect((await judgment.json()).question.id).toBe("q005");

    const multiple = await getQuestion(new Request("http://localhost"), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "5" }),
    });
    expect((await multiple.json()).question.id).toBe("q003");

    for (const position of ["0", "-1", "1.5", "99"]) {
      const invalid = await getQuestion(new Request("http://localhost"), {
        params: Promise.resolve({ bankId: "javascript-basics", questionKey: position }),
      });
      expect(invalid.status).toBe(404);
      expect(await invalid.json()).toMatchObject({ error: { code: "POSITION_NOT_FOUND" } });
    }
  });

  it("returns 404 for missing banks and questions", async () => {
    const missingBank = await getQuestion(new Request("http://localhost"), {
      params: Promise.resolve({ bankId: "missing", questionKey: "1" }),
    });
    expect(missingBank.status).toBe(404);
    expect(await missingBank.json()).toMatchObject({ error: { code: "BANK_NOT_FOUND" } });

    const missingQuestion = await postAnswer(answerRequest({ bankVersion: 2, selectedOptionIds: ["A"] }), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "missing" }),
    });
    expect(missingQuestion.status).toBe(404);
    expect(await missingQuestion.json()).toMatchObject({ error: { code: "QUESTION_NOT_FOUND" } });
  });

  it("grades single, judgment and order-independent multiple answers", async () => {
    const single = await postAnswer(answerRequest({ bankVersion: 2, selectedOptionIds: ["B"] }), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "q001" }),
    });
    expect(await single.json()).toMatchObject({ isCorrect: true, correctOptionIds: ["B"] });

    const multiple = await postAnswer(answerRequest({ bankVersion: 2, selectedOptionIds: ["B", "A"] }), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "q003" }),
    });
    expect(await multiple.json()).toMatchObject({ isCorrect: true, correctOptionIds: ["A", "B"] });

    const fewer = await postAnswer(answerRequest({ bankVersion: 2, selectedOptionIds: ["A"] }), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "q003" }),
    });
    expect(await fewer.json()).toMatchObject({ isCorrect: false });

    const judgment = await postAnswer(answerRequest({ bankVersion: 2, selectedOptionIds: ["false"] }), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "q005" }),
    });
    expect(await judgment.json()).toMatchObject({ isCorrect: true });
  });

  it.each([
    { bankVersion: 2, selectedOptionIds: [] },
    { bankVersion: 2, selectedOptionIds: ["B", "B"] },
    { bankVersion: 2, selectedOptionIds: ["missing"] },
    { bankVersion: 2, selectedOptionIds: ["A", "B"] },
    { bankVersion: "1", selectedOptionIds: ["B"] },
    { bankVersion: 2, selectedOptionIds: ["B"], extra: true },
  ])("rejects invalid answer payload %#", async (body) => {
    const response = await postAnswer(answerRequest(body), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "q001" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_ANSWER" } });
  });

  it("returns 409 for stale bank versions", async () => {
    const response = await postAnswer(answerRequest({ bankVersion: 99, selectedOptionIds: ["B"] }), {
      params: Promise.resolve({ bankId: "javascript-basics", questionKey: "q001" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "BANK_VERSION_CHANGED" } });
  });
});
