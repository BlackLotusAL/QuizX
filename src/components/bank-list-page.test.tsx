import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BankListPage } from "@/components/bank-list-page";
import { fetchBanks } from "@/lib/client/api";
import { PROGRESS_KEY } from "@/lib/client/progress";
import type { QuestionSummary } from "@/types/quiz";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/client/api", () => ({
  fetchBanks: vi.fn(),
}));

const bank: QuestionSummary = {
  id: "javascript-basics",
  title: "JavaScript 基础",
  description: "描述",
  version: 1,
  questionCount: 6,
};

beforeEach(() => {
  localStorage.clear();
  push.mockReset();
  vi.mocked(fetchBanks).mockReset();
});

describe("BankListPage", () => {
  it("shows loading, empty and retry states", async () => {
    let resolveBanks: (banks: QuestionSummary[]) => void = () => undefined;
    vi.mocked(fetchBanks).mockReturnValue(new Promise((resolve) => { resolveBanks = resolve; }));
    const { unmount } = render(<BankListPage />);
    expect(screen.getByText("正在加载题库…")).toBeInTheDocument();
    await act(async () => resolveBanks([]));
    expect(await screen.findByText("暂无可用题库")).toBeInTheDocument();
    unmount();

    vi.mocked(fetchBanks)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([bank]);
    render(<BankListPage />);
    expect(await screen.findByText("题库加载失败，请检查网络后重试")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("heading", { name: bank.title })).toBeInTheDocument();
  });

  it("shows start, continue and restart labels from local progress", async () => {
    vi.mocked(fetchBanks).mockResolvedValue([bank]);
    const { unmount } = render(<BankListPage />);
    expect(await screen.findByRole("button", { name: /开始练习/ })).toBeInTheDocument();
    unmount();

    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      [bank.id]: { bankVersion: 1, nextPosition: 3, completed: false },
    }));
    const continued = render(<BankListPage />);
    expect(await screen.findByRole("button", { name: /继续练习/ })).toBeInTheDocument();
    continued.unmount();

    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      [bank.id]: { bankVersion: 1, nextPosition: 7, completed: true },
    }));
    render(<BankListPage />);
    const restart = await screen.findByRole("button", { name: /重新练习/ });
    await userEvent.click(restart);
    expect(push).toHaveBeenCalledWith("/practice/javascript-basics");
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}")[bank.id]).toEqual({
      bankVersion: 1,
      nextPosition: 1,
      completed: false,
    });
  });

  it("clears stale progress and tells the user the bank changed", async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      [bank.id]: { bankVersion: 99, nextPosition: 4, completed: false },
    }));
    vi.mocked(fetchBanks).mockResolvedValue([bank]);

    render(<BankListPage />);
    expect(await screen.findByText("题库已更新，将从第 1 题开始")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /开始练习/ })).toBeInTheDocument();
  });
});
