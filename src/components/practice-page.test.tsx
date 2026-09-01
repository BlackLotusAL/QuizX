import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PracticePage } from "@/components/practice-page";
import {
  ApiRequestError,
  fetchBanks,
  fetchQuestion,
  submitAnswer,
} from "@/lib/client/api";
import { PROGRESS_KEY } from "@/lib/client/progress";
import type { AnswerResult, QuestionPayload, QuestionSummary } from "@/types/quiz";

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/client/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/api")>();
  return {
    ...actual,
    fetchBanks: vi.fn(),
    fetchQuestion: vi.fn(),
    submitAnswer: vi.fn(),
  };
});

const bank: QuestionSummary = {
  id: "javascript-basics",
  title: "JavaScript 基础",
  description: "描述",
  version: 1,
  questionCount: 6,
};

function questionPayload(overrides: Partial<QuestionPayload> = {}): QuestionPayload {
  return {
    bank: { id: bank.id, title: bank.title, version: bank.version },
    position: 1,
    total: 6,
    question: {
      id: "q001",
      type: "single",
      stemMd: "测试题干",
      options: [
        { id: "A", text: "选项 A" },
        { id: "B", text: "选项 B" },
      ],
    },
    ...overrides,
  };
}

const wrongResult: AnswerResult = {
  isCorrect: false,
  correctOptionIds: ["B"],
  explanationMd: "B 正确，A 是常见误区。",
};

beforeEach(() => {
  localStorage.clear();
  push.mockReset();
  replace.mockReset();
  vi.mocked(fetchBanks).mockReset().mockResolvedValue([bank]);
  vi.mocked(fetchQuestion).mockReset().mockResolvedValue(questionPayload());
  vi.mocked(submitAnswer).mockReset();
  window.scrollTo = vi.fn();
});

async function renderReadyPractice(): Promise<void> {
  render(<PracticePage bankId={bank.id} />);
  await screen.findByText("测试题干");
}

describe("PracticePage", () => {
  it("uses radio selection, disables empty submit and locks after feedback", async () => {
    vi.mocked(submitAnswer).mockResolvedValue(wrongResult);
    await renderReadyPractice();
    const user = userEvent.setup();

    const submit = screen.getByRole("button", { name: "提交答案" });
    expect(submit).toBeDisabled();

    const optionA = screen.getByRole("radio", { name: /选项 A/ });
    const optionB = screen.getByRole("radio", { name: /选项 B/ });
    await user.click(optionA);
    await user.click(optionB);
    expect(optionA).not.toBeChecked();
    expect(optionB).toBeChecked();

    await user.click(optionA);
    await user.click(submit);
    expect(await screen.findByText("回答错误")).toBeInTheDocument();
    expect(screen.getByText(/你的错选/)).toBeInTheDocument();
    expect(screen.getByText(/正确答案/)).toBeInTheDocument();
    expect(optionA).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(screen.getByRole("button", { name: /下一题/ })).toBeInTheDocument();
  });

  it("allows multiple checkbox selection and submits the complete set", async () => {
    const multiplePayload = questionPayload({
      position: 3,
      question: {
        id: "q003",
        type: "multiple",
        stemMd: "测试题干",
        options: [
          { id: "A", text: "选项 A" },
          { id: "B", text: "选项 B" },
          { id: "C", text: "选项 C" },
        ],
      },
    });
    vi.mocked(fetchQuestion).mockResolvedValue(multiplePayload);
    vi.mocked(submitAnswer).mockResolvedValue({
      isCorrect: true,
      correctOptionIds: ["A", "B"],
      explanationMd: "A 与 B 正确。",
    });
    await renderReadyPractice();
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: /选项 A/ }));
    await user.click(screen.getByRole("checkbox", { name: /选项 B/ }));
    await user.click(screen.getByRole("button", { name: "提交答案" }));

    await waitFor(() => expect(submitAnswer).toHaveBeenCalledWith(
      bank.id,
      "q003",
      { bankVersion: 1, selectedOptionIds: ["A", "B"] },
    ));
    expect(await screen.findByText("回答正确")).toBeInTheDocument();
  });

  it("preserves the selection after a failed submit and permits retry", async () => {
    vi.mocked(submitAnswer)
      .mockRejectedValueOnce(new Error("提交失败，已保留你的选择，请重试"))
      .mockResolvedValueOnce(wrongResult);
    await renderReadyPractice();
    const user = userEvent.setup();
    const optionA = screen.getByRole("radio", { name: /选项 A/ });

    await user.click(optionA);
    await user.click(screen.getByRole("button", { name: "提交答案" }));
    expect(await screen.findByText("提交失败，已保留你的选择，请重试")).toBeInTheDocument();
    expect(optionA).toBeChecked();
    expect(screen.getByRole("button", { name: "提交答案" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "提交答案" }));
    expect(await screen.findByText("回答错误")).toBeInTheDocument();
  });

  it("keeps current feedback when next-question loading fails and advances only after retry", async () => {
    const nextPayload = questionPayload({
      position: 2,
      question: {
        id: "q002",
        type: "single",
        stemMd: "第二题题干",
        options: [{ id: "A", text: "A" }, { id: "B", text: "B" }],
      },
    });
    vi.mocked(fetchQuestion)
      .mockResolvedValueOnce(questionPayload())
      .mockRejectedValueOnce(new Error("下一题加载失败，请重试"))
      .mockResolvedValueOnce(nextPayload);
    vi.mocked(submitAnswer).mockResolvedValue(wrongResult);
    await renderReadyPractice();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: /选项 A/ }));
    await user.click(screen.getByRole("button", { name: "提交答案" }));
    await user.click(await screen.findByRole("button", { name: /下一题/ }));

    expect(await screen.findByText("下一题加载失败，请重试")).toBeInTheDocument();
    expect(screen.getByText("回答错误")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")[bank.id].nextPosition).toBe(1);

    await user.click(screen.getByRole("button", { name: /重试下一题/ }));
    expect(await screen.findByText("第二题题干")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")[bank.id].nextPosition).toBe(2);
  });

  it("resets stale progress after a version conflict", async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      [bank.id]: { bankVersion: 1, nextPosition: 1, completed: false },
    }));
    vi.mocked(submitAnswer).mockRejectedValue(
      new ApiRequestError("题库已更新，将从第 1 题开始", 409, "BANK_VERSION_CHANGED"),
    );
    await renderReadyPractice();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: /选项 A/ }));
    await user.click(screen.getByRole("button", { name: "提交答案" }));

    expect(await screen.findByText("题库已更新，将从第 1 题开始")).toBeInTheDocument();
    expect(fetchBanks).toHaveBeenCalledTimes(2);
    expect(fetchQuestion).toHaveBeenLastCalledWith(bank.id, 1);
  });

  it("marks completion only after the final completion action", async () => {
    vi.mocked(fetchQuestion).mockResolvedValue(questionPayload({
      position: 6,
      question: {
        id: "q006",
        type: "judgment",
        stemMd: "测试题干",
        options: [{ id: "true", text: "正确" }, { id: "false", text: "错误" }],
      },
    }));
    vi.mocked(submitAnswer).mockResolvedValue({
      isCorrect: true,
      correctOptionIds: ["true"],
      explanationMd: "解析",
    });
    await renderReadyPractice();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "正确" }));
    await user.click(screen.getByRole("button", { name: "提交答案" }));
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")[bank.id].completed).toBe(false);

    await user.click(await screen.findByRole("button", { name: /完成练习/ }));
    expect(await screen.findByRole("heading", { name: "练习完成" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")[bank.id]).toEqual({
      bankVersion: 1,
      nextPosition: 7,
      completed: true,
    });
  });

  it("redirects a deleted bank and clears its local progress", async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      [bank.id]: { bankVersion: 1, nextPosition: 2, completed: false },
    }));
    vi.mocked(fetchBanks).mockResolvedValue([]);

    render(<PracticePage bankId={bank.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/?notice=bank-not-found"));
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({});
  });
});
