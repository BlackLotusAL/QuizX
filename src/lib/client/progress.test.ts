import { describe, expect, it } from "vitest";

import {
  PROGRESS_KEY,
  readProgress,
  reconcileProgress,
  removeBankProgress,
  setBankProgress,
  type StorageLike,
} from "@/lib/client/progress";
import type { QuestionSummary } from "@/types/quiz";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const banks: QuestionSummary[] = [
  { id: "current", title: "当前", description: "描述", version: 2, questionCount: 6 },
];

function persisted(banksValue: Record<string, unknown>): string {
  return JSON.stringify({ schemaVersion: 2, banks: banksValue });
}

describe("progress storage", () => {
  it("stores current position, drafts and submitted feedback in the v2 shape", () => {
    const storage = new MemoryStorage();
    setBankProgress("current", {
      bankVersion: 2,
      currentPosition: 3,
      attempts: {
        "2": { questionId: "q2", selectedOptionIds: ["A"] },
        "3": {
          questionId: "q3",
          selectedOptionIds: ["A", "B"],
          result: {
            isCorrect: true,
            correctOptionIds: ["A", "B"],
            explanationMd: "解析",
          },
        },
      },
    }, storage);

    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({
      schemaVersion: 2,
      banks: {
        current: {
          bankVersion: 2,
          currentPosition: 3,
          attempts: {
            "2": { questionId: "q2", selectedOptionIds: ["A"] },
            "3": {
              questionId: "q3",
              selectedOptionIds: ["A", "B"],
              result: {
                isCorrect: true,
                correctOptionIds: ["A", "B"],
                explanationMd: "解析",
              },
            },
          },
        },
      },
    });
  });

  it("removes malformed roots and sanitizes invalid entries and attempts", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, "not-json");
    expect(readProgress(storage)).toEqual({});
    expect(storage.getItem(PROGRESS_KEY)).toBeNull();

    storage.setItem(PROGRESS_KEY, persisted({
      current: {
        bankVersion: 2,
        currentPosition: 2,
        attempts: {
          "1": { questionId: "q1", selectedOptionIds: ["A"], extra: true },
          "2": { questionId: "q2", selectedOptionIds: [] },
          bad: { questionId: "q3", selectedOptionIds: ["B"] },
        },
        extra: true,
      },
      invalid: { bankVersion: "2", currentPosition: 1, attempts: {} },
    }));

    expect(readProgress(storage)).toEqual({
      current: {
        bankVersion: 2,
        currentPosition: 2,
        attempts: { "1": { questionId: "q1", selectedOptionIds: ["A"] } },
      },
    });
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({
      schemaVersion: 2,
      banks: {
        current: {
          bankVersion: 2,
          currentPosition: 2,
          attempts: { "1": { questionId: "q1", selectedOptionIds: ["A"] } },
        },
      },
    });
  });

  it("resets the legacy progress shape and reports the one-time migration", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, JSON.stringify({
      current: { bankVersion: 1, nextPosition: 3, completed: false },
    }));

    const reconciled = reconcileProgress(banks, storage);
    expect(reconciled.progress).toEqual({});
    expect(reconciled.legacyReset).toBe(true);
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({
      schemaVersion: 2,
      banks: {},
    });
  });

  it("does not throw when storage is unavailable", () => {
    const unavailable: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };

    expect(readProgress(unavailable)).toEqual({});
    expect(() => setBankProgress("current", {
      bankVersion: 2,
      currentPosition: 1,
      attempts: {},
    }, unavailable)).not.toThrow();
  });

  it("clears deleted, stale and out-of-range entries and attempts", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, persisted({
      deleted: { bankVersion: 1, currentPosition: 1, attempts: {} },
      current: { bankVersion: 1, currentPosition: 2, attempts: {} },
    }));

    const reconciled = reconcileProgress(banks, storage);
    expect(reconciled.progress).toEqual({});
    expect(reconciled.deletedBankIds).toEqual(["deleted"]);
    expect(reconciled.updatedBankIds).toEqual(["current"]);

    storage.setItem(PROGRESS_KEY, persisted({
      current: {
        bankVersion: 2,
        currentPosition: 2,
        attempts: {
          "1": { questionId: "q1", selectedOptionIds: ["A"] },
          "7": { questionId: "q7", selectedOptionIds: ["B"] },
        },
      },
    }));
    expect(reconcileProgress(banks, storage).progress.current.attempts).toEqual({
      "1": { questionId: "q1", selectedOptionIds: ["A"] },
    });

    storage.setItem(PROGRESS_KEY, persisted({
      current: { bankVersion: 2, currentPosition: 7, attempts: {} },
    }));
    expect(reconcileProgress(banks, storage).progress).toEqual({});
  });

  it("removes one bank without disturbing the v2 storage envelope", () => {
    const storage = new MemoryStorage();
    setBankProgress("current", {
      bankVersion: 2,
      currentPosition: 1,
      attempts: {},
    }, storage);

    expect(removeBankProgress("current", storage)).toEqual({});
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({
      schemaVersion: 2,
      banks: {},
    });
  });
});
