import { render, screen, waitFor, within } from "@testing-library/react";
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

const sections: QuestionPayload["sections"] = [
  { type: "single", startPosition: 1, count: 2 },
  { type: "judgment", startPosition: 3, count: 2 },
  { type: "multiple", startPosition: 5, count: 2 },
];

function questionPayload(position = 1): QuestionPayload {
  const questions: Record<number, QuestionPayload["question"]> = {
    1: {
      id: "q001",
      type: "single",
      stemMd: "第一题题干",
      options: [{ id: "A", text: "选项 A" }, { id: "B", text: "选项 B" }],
    },
    2: {
      id: "q002",
      type: "single",
      stemMd: "第二题题干",
      options: [{ id: "A", text: "选项 A" }, { id: "B", text: "选项 B" }],
    },
    3: {
      id: "q005",
      type: "judgment",
      stemMd: "第三题判断题",
      options: [{ id: "true", text: "正确" }, { id: "false", text: "错误" }],
    },
    4: {
      id: "q006",
      type: "judgment",
      stemMd: "第四题判断题",
      options: [{ id: "true", text: "正确" }, { id: "false", text: "错误" }],
    },
    5: {
      id: "q003",
      type: "multiple",
      stemMd: "第五题多选题",
      options: [
        { id: "A", text: "选项 A" },
        { id: "B", text: "选项 B" },
        { id: "C", text: "选项 C" },
      ],
    },
    6: {
      id: "q004",
      type: "multiple",
      stemMd: "第六题多选题",
      options: [
        { id: "A", text: "选项 A" },
        { id: "B", text: "选项 B" },
        { id: "C", text: "选项 C" },
      ],
    },
  };

  return {
    bank: { id: bank.id, title: bank.title, version: bank.version },
    position,
    total: 6,
    sections,
    question: questions[position],
  };
}

const wrongResult: AnswerResult = {
  isCorrect: false,
  correctOptionIds: ["B"],
  explanationMd: "B 正确，A 是常见误区。",
};

function storeProgress(value: Record<string, unknown>): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ schemaVersion: 2, banks: value }));
}

function storedBank(): Record<string, unknown> | undefined {
  const root = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
  return root.banks?.[bank.id];
}

beforeEach(() => {
  localStorage.clear();
  push.mockReset();
  replace.mockReset();
  vi.mocked(fetchBanks).mockReset().mockResolvedValue([bank]);
  vi.mocked(fetchQuestion).mockReset().mockImplementation(
    async (_bankId, position) => questionPayload(position),
  );
  vi.mocked(submitAnswer).mockReset();
  window.scrollTo = vi.fn();
});

async function renderReadyPractice(): Promise<void> {
  render(<PracticePage bankId={bank.id} />);
  await screen.findByText("第一题题干");
}

describe("PracticePage", () => {
  it("shows type sections, global question numbers and bounded previous/next controls", async () => {
    await renderReadyPractice();

    expect(screen.getByRole("heading", { name: "单选题，第 1 题" })).toBeInTheDocument();
    const navigator = screen.getByRole("complementary", { name: "题目导航" });
    expect(within(navigator).getByRole("heading", { name: "单选题" })).toBeInTheDocument();
    expect(within(navigator).getByRole("heading", { name: "判断题" })).toBeInTheDocument();
    expect(within(navigator).getByRole("heading", { name: "多选题" })).toBeInTheDocument();
    expect(within(navigator).getByRole("button", { name: "第 1 题，单选题，未作答" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /上一题/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /下一题/ })).toBeEnabled();
    expect(screen.queryByText("练习完成")).not.toBeInTheDocument();
  });

  it("persists a draft and submitted feedback while jumping and after remount", async () => {
    vi.mocked(submitAnswer).mockResolvedValue(wrongResult);
    const view = render(<PracticePage bankId={bank.id} />);
    await screen.findByText("第一题题干");
    const user = userEvent.setup();

    const optionA = screen.getByRole("radio", { name: /选项 A/ });
    await user.click(optionA);
    expect(storedBank()).toMatchObject({
      currentPosition: 1,
      attempts: { "1": { questionId: "q001", selectedOptionIds: ["A"] } },
    });

    const navigator = screen.getByRole("complementary", { name: "题目导航" });
    await user.click(within(navigator).getByRole("button", { name: "第 3 题，判断题，未作答" }));
    expect(await screen.findByText("第三题判断题")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "判断题，第 3 题" })).toBeInTheDocument();

    await user.click(within(navigator).getByRole("button", { name: "第 1 题，单选题，已选择，未提交" }));
    expect(await screen.findByText("第一题题干")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /选项 A/ })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "提交答案" }));
    expect(await screen.findByText("回答错误")).toBeInTheDocument();
    expect(storedBank()).toMatchObject({
      attempts: { "1": { result: wrongResult } },
    });
    expect(screen.queryByRole("button", { name: "提交答案" })).not.toBeInTheDocument();

    view.unmount();
    render(<PracticePage bankId={bank.id} />);
    expect(await screen.findByText("回答错误")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /选项 A/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /选项 A/ })).toBeDisabled();
  });

  it("allows multiple selection and submits the complete set", async () => {
    storeProgress({
      [bank.id]: { bankVersion: 1, currentPosition: 5, attempts: {} },
    });
    vi.mocked(submitAnswer).mockResolvedValue({
      isCorrect: true,
      correctOptionIds: ["A", "B"],
      explanationMd: "A 与 B 正确。",
    });
    render(<PracticePage bankId={bank.id} />);
    await screen.findByText("第五题多选题");
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

  it("keeps the current draft when navigation fails and updates position only after retry", async () => {
    vi.mocked(fetchQuestion)
      .mockResolvedValueOnce(questionPayload(1))
      .mockRejectedValueOnce(new Error("下一题加载失败，请重试"))
      .mockResolvedValueOnce(questionPayload(2));
    await renderReadyPractice();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: /选项 A/ }));
    await user.click(screen.getByRole("button", { name: /下一题/ }));

    expect(await screen.findByText("下一题加载失败，请重试")).toBeInTheDocument();
    expect(screen.getByText("第一题题干")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /选项 A/ })).toBeChecked();
    expect(storedBank()).toMatchObject({ currentPosition: 1 });

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("第二题题干")).toBeInTheDocument();
    expect(storedBank()).toMatchObject({ currentPosition: 2 });
  });

  it("resets saved attempts after a version conflict", async () => {
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
    expect(storedBank()).toMatchObject({ currentPosition: 1, attempts: {} });
  });

  it("clears only the current bank after confirmation and returns to the first question", async () => {
    vi.mocked(fetchBanks).mockResolvedValue([
      bank,
      { id: "other", title: "其他", description: "描述", version: 1, questionCount: 2 },
    ]);
    storeProgress({
      [bank.id]: {
        bankVersion: 1,
        currentPosition: 3,
        attempts: {
          "1": { questionId: "q001", selectedOptionIds: ["A"], result: wrongResult },
          "3": { questionId: "q005", selectedOptionIds: ["false"] },
        },
      },
      other: { bankVersion: 1, currentPosition: 2, attempts: {} },
    });
    render(<PracticePage bankId={bank.id} />);
    await screen.findByText("第三题判断题");
    const user = userEvent.setup();
    const navigator = screen.getByRole("complementary", { name: "题目导航" });

    await user.click(within(navigator).getByRole("button", { name: "清空答题记录" }));
    const confirmation = await screen.findByRole("dialog", { name: "清空这套题的答题记录？" });
    await user.click(within(confirmation).getByRole("button", { name: "确认清空" }));

    expect(await screen.findByText("第一题题干")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
    expect(stored.banks[bank.id]).toBeUndefined();
    expect(stored.banks.other).toBeDefined();
  });

  it("opens the same grouped navigator from the mobile trigger", async () => {
    await renderReadyPractice();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /题目导航.*1.*6/ }));
    const dialog = await screen.findByRole("dialog", { name: "题目导航" });
    expect(within(dialog).getByRole("heading", { name: "单选题" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "第 5 题，多选题，未作答" }));
    expect(await screen.findByText("第五题多选题")).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute("open");
  });

  it("redirects a deleted bank and clears its local progress", async () => {
    storeProgress({
      [bank.id]: { bankVersion: 1, currentPosition: 2, attempts: {} },
    });
    vi.mocked(fetchBanks).mockResolvedValue([]);

    render(<PracticePage bankId={bank.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/?notice=bank-not-found"));
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({
      schemaVersion: 2,
      banks: {},
    });
  });
});
