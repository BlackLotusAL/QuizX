import type { ProgressEntry, ProgressState, QuestionSummary } from "@/types/quiz";

export const PROGRESS_KEY = "quizx.progress";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeEntry(value: unknown): ProgressEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !Number.isSafeInteger(value.bankVersion) ||
    Number(value.bankVersion) < 1 ||
    !Number.isSafeInteger(value.nextPosition) ||
    Number(value.nextPosition) < 1 ||
    typeof value.completed !== "boolean"
  ) {
    return null;
  }

  return {
    bankVersion: Number(value.bankVersion),
    nextPosition: Number(value.nextPosition),
    completed: value.completed,
  };
}

export function readProgress(storage: StorageLike | null = getBrowserStorage()): ProgressState {
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(PROGRESS_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      storage.removeItem(PROGRESS_KEY);
      return {};
    }

    const progress: ProgressState = {};
    let sanitized = false;
    for (const [bankId, value] of Object.entries(parsed)) {
      const entry = normalizeEntry(value);
      if (entry) {
        progress[bankId] = entry;
        if (
          !isRecord(value) ||
          Object.keys(value).sort().join(",") !== "bankVersion,completed,nextPosition"
        ) {
          sanitized = true;
        }
      } else {
        sanitized = true;
      }
    }
    if (sanitized) {
      storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    }
    return progress;
  } catch {
    try {
      storage.removeItem(PROGRESS_KEY);
    } catch {
      // Storage can be readable but not writable in privacy-restricted contexts.
    }
    return {};
  }
}

export function writeProgress(
  progress: ProgressState,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Progress is a convenience. Storage failure must never block practice.
  }
}

export function setBankProgress(
  bankId: string,
  entry: ProgressEntry,
  storage: StorageLike | null = getBrowserStorage(),
): ProgressState {
  const progress = readProgress(storage);
  progress[bankId] = {
    bankVersion: entry.bankVersion,
    nextPosition: entry.nextPosition,
    completed: entry.completed,
  };
  writeProgress(progress, storage);
  return progress;
}

export function removeBankProgress(
  bankId: string,
  storage: StorageLike | null = getBrowserStorage(),
): ProgressState {
  const progress = readProgress(storage);
  delete progress[bankId];
  writeProgress(progress, storage);
  return progress;
}

export interface ReconciledProgress {
  progress: ProgressState;
  updatedBankIds: string[];
  deletedBankIds: string[];
}

export function reconcileProgress(
  banks: QuestionSummary[],
  storage: StorageLike | null = getBrowserStorage(),
): ReconciledProgress {
  const progress = readProgress(storage);
  const bankMap = new Map(banks.map((bank) => [bank.id, bank]));
  const updatedBankIds: string[] = [];
  const deletedBankIds: string[] = [];
  let changed = false;

  for (const [bankId, entry] of Object.entries(progress)) {
    const bank = bankMap.get(bankId);
    if (!bank) {
      delete progress[bankId];
      deletedBankIds.push(bankId);
      changed = true;
      continue;
    }

    if (entry.bankVersion !== bank.version) {
      delete progress[bankId];
      updatedBankIds.push(bankId);
      changed = true;
      continue;
    }

    const positionIsValid = entry.completed
      ? entry.nextPosition === bank.questionCount + 1
      : entry.nextPosition >= 1 && entry.nextPosition <= bank.questionCount;

    if (!positionIsValid) {
      delete progress[bankId];
      changed = true;
    }
  }

  if (changed) {
    writeProgress(progress, storage);
  }

  return { progress, updatedBankIds, deletedBankIds };
}
