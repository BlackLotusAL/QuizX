"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MarkdownContent } from "@/components/markdown-content";
import { QuestionNavigator } from "@/components/question-navigator";
import {
  ApiRequestError,
  fetchBanks,
  fetchQuestion,
  submitAnswer,
} from "@/lib/client/api";
import {
  reconcileProgress,
  removeBankProgress,
  setBankProgress,
} from "@/lib/client/progress";
import { QUESTION_TYPE_LABELS } from "@/lib/question-types";
import type {
  AnswerResult,
  ProgressEntry,
  QuestionAttempt,
  QuestionPayload,
} from "@/types/quiz";

interface PracticePageProps {
  bankId: string;
}

interface NavigationError {
  message: string;
  targetPosition: number;
}

type Screen = "loading" | "question" | "error";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function emptyProgress(bankVersion: number, currentPosition = 1): ProgressEntry {
  return { bankVersion, currentPosition, attempts: {} };
}

function compatibleAttempt(
  payload: QuestionPayload,
  attempt: QuestionAttempt | undefined,
): QuestionAttempt | undefined {
  if (!attempt || attempt.questionId !== payload.question.id) {
    return undefined;
  }

  const optionIds = new Set(payload.question.options.map((option) => option.id));
  const selectionIsValid =
    attempt.selectedOptionIds.length > 0 &&
    attempt.selectedOptionIds.every((optionId) => optionIds.has(optionId)) &&
    (payload.question.type === "multiple" || attempt.selectedOptionIds.length === 1);
  const resultIsValid =
    !attempt.result || attempt.result.correctOptionIds.every((optionId) => optionIds.has(optionId));

  return selectionIsValid && resultIsValid ? attempt : undefined;
}

export function PracticePage({ bankId }: PracticePageProps) {
  const router = useRouter();
  const questionTitleRef = useRef<HTMLHeadingElement>(null);
  const focusAfterNavigationRef = useRef(false);
  const [screen, setScreen] = useState<Screen>("loading");
  const [payload, setPayload] = useState<QuestionPayload | null>(null);
  const [progressEntry, setProgressEntry] = useState<ProgressEntry | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [navigationError, setNavigationError] = useState<NavigationError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<number | null>(null);

  const redirectMissingBank = useCallback(() => {
    removeBankProgress(bankId);
    router.replace("/?notice=bank-not-found");
  }, [bankId, router]);

  const showQuestion = useCallback((
    questionPayload: QuestionPayload,
    baseEntry?: ProgressEntry,
    persist = true,
  ) => {
    const sourceEntry = baseEntry?.bankVersion === questionPayload.bank.version
      ? baseEntry
      : emptyProgress(questionPayload.bank.version, questionPayload.position);
    const positionKey = String(questionPayload.position);
    const storedAttempt = sourceEntry.attempts[positionKey];
    const restoredAttempt = compatibleAttempt(questionPayload, storedAttempt);
    const attempts = { ...sourceEntry.attempts };

    if (storedAttempt && !restoredAttempt) {
      delete attempts[positionKey];
    }

    const nextEntry: ProgressEntry = {
      bankVersion: questionPayload.bank.version,
      currentPosition: questionPayload.position,
      attempts,
    };

    setProgressEntry(nextEntry);
    if (persist) {
      setBankProgress(bankId, nextEntry);
    }
    setPayload(questionPayload);
    setSelectedOptionIds(restoredAttempt?.selectedOptionIds ?? []);
    setResult(restoredAttempt?.result ?? null);
    setSubmitError(null);
    setNavigationError(null);
    setScreen("question");
  }, [bankId]);

  const initialize = useCallback(async (forcedNotice?: string) => {
    setScreen("loading");
    setLoadError(null);
    setSubmitError(null);
    setNavigationError(null);
    setNotice(forcedNotice ?? null);

    try {
      const banks = await fetchBanks();
      const currentBank = banks.find((candidate) => candidate.id === bankId);
      if (!currentBank) {
        redirectMissingBank();
        return;
      }

      const reconciled = reconcileProgress(banks);
      if (!forcedNotice && reconciled.legacyReset) {
        setNotice("题目导航已更新，将从第 1 题开始");
      } else if (!forcedNotice && reconciled.updatedBankIds.includes(bankId)) {
        setNotice("题库已更新，将从第 1 题开始");
      }

      const entry = reconciled.progress[bankId];
      const position = entry?.currentPosition ?? 1;
      const questionPayload = await fetchQuestion(bankId, position);
      showQuestion(
        questionPayload,
        entry ?? emptyProgress(currentBank.version, position),
      );
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "BANK_NOT_FOUND") {
        redirectMissingBank();
        return;
      }
      setLoadError(errorMessage(error, "题目加载失败，请重试"));
      setScreen("error");
    }
  }, [bankId, redirectMissingBank, showQuestion]);

  useEffect(() => {
    const timer = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(timer);
  }, [initialize]);

  useEffect(() => {
    if (!payload || !focusAfterNavigationRef.current) {
      return;
    }
    focusAfterNavigationRef.current = false;
    questionTitleRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [payload]);

  const selectedSet = useMemo(() => new Set(selectedOptionIds), [selectedOptionIds]);
  const correctSet = useMemo(
    () => new Set(result?.correctOptionIds ?? []),
    [result?.correctOptionIds],
  );

  function persistEntry(nextEntry: ProgressEntry): void {
    setProgressEntry(nextEntry);
    setBankProgress(bankId, nextEntry);
  }

  function handleOptionChange(optionId: string, checked: boolean): void {
    if (!payload || !progressEntry || result || submitting) {
      return;
    }

    const nextSelectedOptionIds = payload.question.type !== "multiple"
      ? [optionId]
      : checked
        ? [...selectedOptionIds, optionId]
        : selectedOptionIds.filter((selectedId) => selectedId !== optionId);
    const attempts = { ...progressEntry.attempts };
    const positionKey = String(payload.position);

    if (nextSelectedOptionIds.length === 0) {
      delete attempts[positionKey];
    } else {
      attempts[positionKey] = {
        questionId: payload.question.id,
        selectedOptionIds: nextSelectedOptionIds,
      };
    }

    setSelectedOptionIds(nextSelectedOptionIds);
    persistEntry({ ...progressEntry, attempts });
  }

  async function handleSubmit(): Promise<void> {
    if (!payload || !progressEntry || selectedOptionIds.length === 0 || result || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const answerResult = await submitAnswer(bankId, payload.question.id, {
        bankVersion: payload.bank.version,
        selectedOptionIds,
      });
      const nextEntry: ProgressEntry = {
        ...progressEntry,
        attempts: {
          ...progressEntry.attempts,
          [String(payload.position)]: {
            questionId: payload.question.id,
            selectedOptionIds: [...selectedOptionIds],
            result: answerResult,
          },
        },
      };
      persistEntry(nextEntry);
      setResult(answerResult);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "BANK_VERSION_CHANGED") {
          removeBankProgress(bankId);
          await initialize("题库已更新，将从第 1 题开始");
          return;
        }
        if (error.code === "BANK_NOT_FOUND") {
          redirectMissingBank();
          return;
        }
        if (error.code === "QUESTION_NOT_FOUND") {
          removeBankProgress(bankId);
          await initialize("题目内容已更新，已从第 1 题重新开始");
          return;
        }
      }
      setSubmitError(errorMessage(error, "提交失败，已保留你的选择，请重试"));
    } finally {
      setSubmitting(false);
    }
  }

  async function navigateTo(targetPosition: number): Promise<boolean> {
    if (
      !payload ||
      !progressEntry ||
      navigating ||
      targetPosition < 1 ||
      targetPosition > payload.total
    ) {
      return false;
    }
    if (targetPosition === payload.position) {
      return true;
    }

    setNavigating(true);
    setNavigationTarget(targetPosition);
    setNavigationError(null);

    try {
      const nextPayload = await fetchQuestion(bankId, targetPosition);
      focusAfterNavigationRef.current = true;
      showQuestion(nextPayload, progressEntry);
      return true;
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "BANK_NOT_FOUND") {
        redirectMissingBank();
        return false;
      }
      setNavigationError({
        message: errorMessage(error, `第 ${targetPosition} 题加载失败，请重试`),
        targetPosition,
      });
      return false;
    } finally {
      setNavigating(false);
      setNavigationTarget(null);
    }
  }

  async function handleClear(): Promise<void> {
    if (!payload || navigating) {
      return;
    }

    setNavigating(true);
    setNavigationTarget(1);
    setNavigationError(null);

    try {
      const firstPayload = payload.position === 1
        ? payload
        : await fetchQuestion(bankId, 1);
      removeBankProgress(bankId);
      focusAfterNavigationRef.current = true;
      setNotice(null);
      showQuestion(firstPayload, emptyProgress(firstPayload.bank.version), false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "BANK_NOT_FOUND") {
        redirectMissingBank();
        return;
      }
      setNavigationError({
        message: errorMessage(error, "第 1 题加载失败，请稍后重新清空答题记录"),
        targetPosition: 1,
      });
    } finally {
      setNavigating(false);
      setNavigationTarget(null);
    }
  }

  if (screen === "loading") {
    return (
      <main className="page-shell practice-shell practice-shell--state">
        <Link className="back-link" href="/">
          <span aria-hidden="true">←</span> 返回题库
        </Link>
        <section className="state-card" aria-live="polite">
          <p className="state-kicker">正在读取</p>
          <h1>正在加载题目…</h1>
        </section>
      </main>
    );
  }

  if (screen === "error") {
    return (
      <main className="page-shell practice-shell practice-shell--state">
        <Link className="back-link" href="/">
          <span aria-hidden="true">←</span> 返回题库
        </Link>
        <section className="state-card state-card--error" role="alert">
          <p className="state-kicker">加载失败</p>
          <h1>{loadError ?? "题目加载失败，请重试"}</h1>
          <button className="primary-button compact-button" type="button" onClick={() => initialize()}>
            重试
          </button>
        </section>
      </main>
    );
  }

  if (!payload || !progressEntry) {
    return null;
  }

  const questionTypeLabel = QUESTION_TYPE_LABELS[payload.question.type];
  const previousPosition = payload.position - 1;
  const nextPosition = payload.position + 1;

  return (
    <main className="page-shell practice-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 返回题库
      </Link>

      <div className="practice-layout">
        <header className="practice-header">
          <div className="practice-title-row">
            <div>
              <p className="eyebrow">{payload.bank.title}</p>
              <h1
                aria-label={`${questionTypeLabel}，第 ${payload.position} 题`}
                ref={questionTitleRef}
                tabIndex={-1}
              >
                {questionTypeLabel}
              </h1>
            </div>
            <p className="position-counter" aria-label={`第 ${payload.position} 题，共 ${payload.total} 题`}>
              <strong>{payload.position}</strong> / {payload.total}
            </p>
          </div>
        </header>

        <QuestionNavigator
          attempts={progressEntry.attempts}
          currentPosition={payload.position}
          navigating={navigating}
          sections={payload.sections}
          total={payload.total}
          onClear={handleClear}
          onNavigate={navigateTo}
        />

        {notice ? (
          <div className="notice practice-notice" role="status">
            <span aria-hidden="true">i</span>
            <p>{notice}</p>
          </div>
        ) : null}

        <section className="question-card">
          <MarkdownContent className="question-stem">{payload.question.stemMd}</MarkdownContent>

          <fieldset className="options-list" disabled={Boolean(result) || submitting}>
            <legend className="sr-only">请选择答案</legend>
            {payload.question.options.map((option) => {
              const isSelected = selectedSet.has(option.id);
              const isCorrect = correctSet.has(option.id);
              const isWrongSelection = Boolean(result && isSelected && !isCorrect);
              const stateClass = result
                ? isCorrect
                  ? " option--correct"
                  : isWrongSelection
                    ? " option--wrong"
                    : " option--muted"
                : "";

              return (
                <label className={`option${stateClass}`} key={option.id}>
                  <input
                    checked={isSelected}
                    name="answer"
                    onChange={(event) => handleOptionChange(option.id, event.target.checked)}
                    type={payload.question.type === "multiple" ? "checkbox" : "radio"}
                    value={option.id}
                  />
                  <span className="option-id" aria-hidden="true">{option.id}</span>
                  <span className="option-text">{option.text}</span>
                  {result && isCorrect ? (
                    <span className="option-status">
                      <span aria-hidden="true">✓</span> 正确答案{isSelected ? " · 你的选择" : ""}
                    </span>
                  ) : null}
                  {isWrongSelection ? (
                    <span className="option-status">
                      <span aria-hidden="true">✕</span> 你的错选
                    </span>
                  ) : null}
                </label>
              );
            })}
          </fieldset>

          {!result ? (
            <button
              className="primary-button submit-button"
              type="button"
              disabled={selectedOptionIds.length === 0 || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "正在提交…" : "提交答案"}
            </button>
          ) : null}

          {submitError ? <p className="inline-error" role="alert">{submitError}</p> : null}

          {result ? (
            <section
              className={`feedback ${result.isCorrect ? "feedback--correct" : "feedback--wrong"}`}
              aria-live="polite"
            >
              <p className="feedback-title">
                <span aria-hidden="true">{result.isCorrect ? "✓" : "✕"}</span>
                {result.isCorrect ? "回答正确" : "回答错误"}
              </p>
              <div className="feedback-divider" />
              <p className="feedback-label">答案解析</p>
              <MarkdownContent className="explanation">{result.explanationMd}</MarkdownContent>
            </section>
          ) : null}

          {navigationError ? (
            <div className="navigation-error" role="alert">
              <p>{navigationError.message}</p>
              <button
                className="secondary-button"
                type="button"
                disabled={navigating}
                onClick={() => void navigateTo(navigationError.targetPosition)}
              >
                重试
              </button>
            </div>
          ) : null}

          <div className="question-step-actions" aria-label="切换题目">
            <button
              className="secondary-button"
              type="button"
              disabled={payload.position === 1 || navigating}
              onClick={() => void navigateTo(previousPosition)}
            >
              {navigating && navigationTarget === previousPosition ? "正在加载…" : "← 上一题"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={payload.position === payload.total || navigating}
              onClick={() => void navigateTo(nextPosition)}
            >
              {navigating && navigationTarget === nextPosition ? "正在加载…" : "下一题 →"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
