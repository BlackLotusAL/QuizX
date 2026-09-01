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

describe("progress storage", () => {
  it("stores only the three allowed progress fields", () => {
    const storage = new MemoryStorage();
    setBankProgress("current", { bankVersion: 2, nextPosition: 3, completed: false }, storage);

    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "{}")).toEqual({
      current: { bankVersion: 2, nextPosition: 3, completed: false },
    });
  });

  it("ignores malformed data and removes an invalid root value", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, "not-json");
    expect(readProgress(storage)).toEqual({});
    expect(storage.getItem(PROGRESS_KEY)).toBeNull();

    storage.setItem(PROGRESS_KEY, JSON.stringify({ current: { answer: "A" } }));
    expect(readProgress(storage)).toEqual({});
    expect(storage.getItem(PROGRESS_KEY)).toBe("{}");

    storage.setItem(PROGRESS_KEY, JSON.stringify({
      current: {
        bankVersion: 2,
        nextPosition: 1,
        completed: false,
        selectedOptionIds: ["A"],
      },
    }));
    expect(readProgress(storage)).toEqual({
      current: { bankVersion: 2, nextPosition: 1, completed: false },
    });
    expect(storage.getItem(PROGRESS_KEY)).not.toContain("selectedOptionIds");
  });

  it("does not throw when storage is unavailable", () => {
    const unavailable: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };

    expect(readProgress(unavailable)).toEqual({});
    expect(() => setBankProgress("current", { bankVersion: 2, nextPosition: 1, completed: false }, unavailable)).not.toThrow();
  });

  it("clears deleted, stale and out-of-range entries", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, JSON.stringify({
      deleted: { bankVersion: 1, nextPosition: 1, completed: false },
      current: { bankVersion: 1, nextPosition: 2, completed: false },
    }));

    const reconciled = reconcileProgress(banks, storage);
    expect(reconciled.progress).toEqual({});
    expect(reconciled.deletedBankIds).toEqual(["deleted"]);
    expect(reconciled.updatedBankIds).toEqual(["current"]);

    storage.setItem(PROGRESS_KEY, JSON.stringify({
      current: { bankVersion: 2, nextPosition: 7, completed: false },
    }));
    expect(reconcileProgress(banks, storage).progress).toEqual({});
  });

  it("accepts exact completed progress and can reset or remove it", () => {
    const storage = new MemoryStorage();
    setBankProgress("current", { bankVersion: 2, nextPosition: 7, completed: true }, storage);
    expect(reconcileProgress(banks, storage).progress.current.completed).toBe(true);

    setBankProgress("current", { bankVersion: 2, nextPosition: 1, completed: false }, storage);
    expect(readProgress(storage).current).toEqual({ bankVersion: 2, nextPosition: 1, completed: false });
    expect(removeBankProgress("current", storage)).toEqual({});
  });
});
