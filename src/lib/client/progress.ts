import type {
  AnswerResult,
  PersistedProgress,
  ProgressEntry,
  ProgressState,
  QuestionAttempt,
  QuestionSummary,
} from "@/types/quiz";

export const PROGRESS_KEY = "quizx.progress";
export const PROGRESS_SCHEMA_VERSION = 2 as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface ProgressReadResult {
  progress: ProgressState;
  legacyReset: boolean;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && /\S/.test(value);
}

function normalizeStringArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 6 ||
    !value.every(isNonEmptyString) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return [...value];
}

function normalizeResult(value: unknown): AnswerResult | null {
  if (!isRecord(value) || typeof value.isCorrect !== "boolean") {
    return null;
  }
  const correctOptionIds = normalizeStringArray(value.correctOptionIds);
  if (!correctOptionIds || !isNonEmptyString(value.explanationMd)) {
    return null;
  }
  return {
    isCorrect: value.isCorrect,
    correctOptionIds,
    explanationMd: value.explanationMd,
  };
}

function normalizeAttempt(value: unknown): QuestionAttempt | null {
  if (!isRecord(value) || !isNonEmptyString(value.questionId)) {
    return null;
  }
  const selectedOptionIds = normalizeStringArray(value.selectedOptionIds);
  if (!selectedOptionIds) {
    return null;
  }

  if (value.result === undefined) {
    return { questionId: value.questionId, selectedOptionIds };
  }
  const result = normalizeResult(value.result);
  return result
    ? { questionId: value.questionId, selectedOptionIds, result }
    : null;
}

function normalizeEntry(value: unknown): ProgressEntry | null {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.bankVersion) ||
    Number(value.bankVersion) < 1 ||
    !Number.isSafeInteger(value.currentPosition) ||
    Number(value.currentPosition) < 1 ||
    !isRecord(value.attempts)
  ) {
    return null;
  }

  const attempts: Record<string, QuestionAttempt> = {};
  for (const [position, candidate] of Object.entries(value.attempts)) {
    if (!/^[1-9]\d*$/.test(position)) {
      continue;
    }
    const attempt = normalizeAttempt(candidate);
    if (attempt) {
      attempts[position] = attempt;
    }
  }

  return {
    bankVersion: Number(value.bankVersion),
    currentPosition: Number(value.currentPosition),
    attempts,
  };
}

function cloneAttempt(attempt: QuestionAttempt): QuestionAttempt {
  return {
    questionId: attempt.questionId,
    selectedOptionIds: [...attempt.selectedOptionIds],
    ...(attempt.result
      ? {
          result: {
            isCorrect: attempt.result.isCorrect,
            correctOptionIds: [...attempt.result.correctOptionIds],
            explanationMd: attempt.result.explanationMd,
          },
        }
      : {}),
  };
}

function cloneEntry(entry: ProgressEntry): ProgressEntry {
  return {
    bankVersion: entry.bankVersion,
    currentPosition: entry.currentPosition,
    attempts: Object.fromEntries(
      Object.entries(entry.attempts).map(([position, attempt]) => [position, cloneAttempt(attempt)]),
    ),
  };
}

function persistedProgress(progress: ProgressState): PersistedProgress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    banks: Object.fromEntries(
      Object.entries(progress).map(([bankId, entry]) => [bankId, cloneEntry(entry)]),
    ),
  };
}

function safeWrite(progress: ProgressState, storage: StorageLike | null): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(persistedProgress(progress)));
  } catch {
    // Progress is a convenience. Storage failure must never block practice.
  }
}

function looksLikeLegacyProgress(value: Record<string, unknown>): boolean {
  return Object.values(value).some(
    (entry) => isRecord(entry) && ("nextPosition" in entry || "completed" in entry),
  );
}

function readProgressWithMeta(
  storage: StorageLike | null = getBrowserStorage(),
): ProgressReadResult {
  if (!storage) {
    return { progress: {}, legacyReset: false };
  }

  try {
    const raw = storage.getItem(PROGRESS_KEY);
    if (!raw) {
      return { progress: {}, legacyReset: false };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      storage.removeItem(PROGRESS_KEY);
      return { progress: {}, legacyReset: false };
    }

    if (parsed.schemaVersion !== PROGRESS_SCHEMA_VERSION || !isRecord(parsed.banks)) {
      const legacyReset = looksLikeLegacyProgress(parsed);
      if (legacyReset) {
        safeWrite({}, storage);
      } else {
        storage.removeItem(PROGRESS_KEY);
      }
      return { progress: {}, legacyReset };
    }

    const progress: ProgressState = {};
    for (const [bankId, value] of Object.entries(parsed.banks)) {
      const entry = normalizeEntry(value);
      if (entry) {
        progress[bankId] = entry;
      }
    }
    safeWrite(progress, storage);
    return { progress, legacyReset: false };
  } catch {
    try {
      storage.removeItem(PROGRESS_KEY);
    } catch {
      // Storage can be readable but not writable in privacy-restricted contexts.
    }
    return { progress: {}, legacyReset: false };
  }
}

export function readProgress(storage: StorageLike | null = getBrowserStorage()): ProgressState {
  return readProgressWithMeta(storage).progress;
}

export function writeProgress(
  progress: ProgressState,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  safeWrite(progress, storage);
}

export function setBankProgress(
  bankId: string,
  entry: ProgressEntry,
  storage: StorageLike | null = getBrowserStorage(),
): ProgressState {
  const progress = readProgress(storage);
  progress[bankId] = cloneEntry(entry);
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
  legacyReset: boolean;
}

export function reconcileProgress(
  banks: QuestionSummary[],
  storage: StorageLike | null = getBrowserStorage(),
): ReconciledProgress {
  const readResult = readProgressWithMeta(storage);
  const progress = readResult.progress;
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

    if (entry.currentPosition > bank.questionCount) {
      delete progress[bankId];
      changed = true;
      continue;
    }

    for (const position of Object.keys(entry.attempts)) {
      if (Number(position) > bank.questionCount) {
        delete entry.attempts[position];
        changed = true;
      }
    }
  }

  if (changed) {
    writeProgress(progress, storage);
  }

  return {
    progress,
    updatedBankIds,
    deletedBankIds,
    legacyReset: readResult.legacyReset,
  };
}
