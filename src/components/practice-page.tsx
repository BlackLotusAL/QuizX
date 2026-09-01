"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MarkdownContent } from "@/components/markdown-content";
import {
  ApiRequestError,
  fetchBanks,
  fetchQuestion,
  submitAnswer,
} from "@/lib/client/api";
import {
  readProgress,
  removeBankProgress,
  setBankProgress,
} from "@/lib/client/progress";
import type { AnswerResult, QuestionPayload, QuestionSummary } from "@/types/quiz";

interface PracticePageProps {
  bankId: string;
}

type Screen = "loading" | "question" | "completed" | "error";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function PracticePage({ bankId }: PracticePageProps) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("loading");
  const [bank, setBank] = useState<QuestionSummary | null>(null);
  const [payload, setPayload] = useState<QuestionPayload | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const redirectMissingBank = useCallback(() => {
    removeBankProgress(bankId);
    router.replace("/?notice=bank-not-found");
  }, [bankId, router]);

  const showQuestion = useCallback(
    (questionPayload: QuestionPayload) => {
      setBank((current) =>
        current ?? {
          id: questionPayload.bank.id,
          title: questionPayload.bank.title,
          description: "",
          version: questionPayload.bank.version,
          questionCount: questionPayload.total,
        },
      );
      setPayload(questionPayload);
      setSelectedOptionIds([]);
      setResult(null);
      setSubmitError(null);
      setNextError(null);
      setBankProgress(bankId, {
        bankVersion: questionPayload.bank.version,
        nextPosition: questionPayload.position,
        completed: false,
      });
      setScreen("question");
    },
    [bankId],
  );

  const initialize = useCallback(
    async (forcedNotice?: string) => {
      setScreen("loading");
      setLoadError(null);
      setSubmitError(null);
      setNextError(null);
      if (forcedNotice) {
        setNotice(forcedNotice);
      }

      try {
        const banks = await fetchBanks();
        const currentBank = banks.find((candidate) => candidate.id === bankId);
        if (!currentBank) {
          redirectMissingBank();
          return;
        }
        setBank(currentBank);

        const entry = readProgress()[bankId];
        if (entry?.bankVersion !== undefined && entry.bankVersion !== currentBank.version) {
          removeBankProgress(bankId);
          setNotice("题库已更新，将从第 1 题开始");
        }

        if (
          entry &&
          entry.bankVersion === currentBank.version &&
          entry.completed &&
          entry.nextPosition === currentBank.questionCount + 1
        ) {
          setScreen("completed");
          return;
        }

        const position =
          entry &&
          entry.bankVersion === currentBank.version &&
          !entry.completed &&
          entry.nextPosition >= 1 &&
          entry.nextPosition <= currentBank.questionCount
            ? entry.nextPosition
            : 1;

        if (position === 1 && entry && entry.nextPosition !== 1) {
          removeBankProgress(bankId);
        }

        showQuestion(await fetchQuestion(bankId, position));
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "BANK_NOT_FOUND") {
          redirectMissingBank();
          return;
        }
        setLoadError(errorMessage(error, "题目加载失败，请重试"));
        setScreen("error");
      }
    },
    [bankId, redirectMissingBank, showQuestion],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(timer);
  }, [initialize]);

  const selectedSet = useMemo(() => new Set(selectedOptionIds), [selectedOptionIds]);
  const correctSet = useMemo(
    () => new Set(result?.correctOptionIds ?? []),
    [result?.correctOptionIds],
  );

  function handleOptionChange(optionId: string, checked: boolean): void {
    if (!payload || result || submitting) {
      return;
    }

    if (payload.question.type !== "multiple") {
      setSelectedOptionIds([optionId]);
      return;
    }

    setSelectedOptionIds((current) =>
      checked
        ? [...current, optionId]
        : current.filter((selectedId) => selectedId !== optionId),
    );
  }

  async function handleSubmit(): Promise<void> {
    if (!payload || selectedOptionIds.length === 0 || result || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const answerResult = await submitAnswer(bankId, payload.question.id, {
        bankVersion: payload.bank.version,
        selectedOptionIds,
      });
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
          await initialize("题目内容已更新，已重新加载当前练习");
          return;
        }
      }
      setSubmitError(errorMessage(error, "提交失败，已保留你的选择，请重试"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext(): Promise<void> {
    if (!payload || !result || advancing || payload.position >= payload.total) {
      return;
    }

    setAdvancing(true);
    setNextError(null);

    try {
      const nextPayload = await fetchQuestion(bankId, payload.position + 1);
      showQuestion(nextPayload);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "BANK_NOT_FOUND") {
        redirectMissingBank();
        return;
      }
      setNextError(errorMessage(error, "下一题加载失败，请重试"));
    } finally {
      setAdvancing(false);
    }
  }

  function handleComplete(): void {
    if (!payload || !result) {
      return;
    }
    setBankProgress(bankId, {
      bankVersion: payload.bank.version,
      nextPosition: payload.total + 1,
      completed: true,
    });
    setScreen("completed");
  }

  async function handleRestart(): Promise<void> {
    if (!bank) {
      return;
    }
    setBankProgress(bankId, {
      bankVersion: bank.version,
      nextPosition: 1,
      completed: false,
    });
    setNotice(null);
    await initialize();
  }

  if (screen === "loading") {
    return (
      <main className="page-shell practice-shell">
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
      <main className="page-shell practice-shell">
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

  if (screen === "completed" && bank) {
    return (
      <main className="page-shell practice-shell">
        <Link className="back-link" href="/">
          <span aria-hidden="true">←</span> 返回题库
        </Link>
        <section className="completion-card">
          <div className="completion-mark" aria-hidden="true">✓</div>
          <p className="state-kicker">{bank.title}</p>
          <h1>练习完成</h1>
          <p>你已完成这套题库，可以返回题库页或重新练习。</p>
          <div className="completion-actions">
            <Link className="secondary-button" href="/">返回题库</Link>
            <button className="primary-button" type="button" onClick={handleRestart}>
              重新练习
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!payload) {
    return null;
  }

  const isLastQuestion = payload.position === payload.total;

  return (
    <main className="page-shell practice-shell">
      <header className="practice-header">
        <Link className="back-link" href="/">
          <span aria-hidden="true">←</span> 返回题库
        </Link>
        <div className="practice-title-row">
          <div>
            <p className="eyebrow">{payload.bank.title}</p>
            <h1>第 {payload.position} 题</h1>
          </div>
          <p className="position-counter" aria-label={`第 ${payload.position} 题，共 ${payload.total} 题`}>
            <strong>{payload.position}</strong> / {payload.total}
          </p>
        </div>
      </header>

      {notice ? (
        <div className="notice" role="status">
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

        <button
          className="primary-button submit-button"
          type="button"
          disabled={selectedOptionIds.length === 0 || submitting || Boolean(result)}
          onClick={handleSubmit}
        >
          {submitting ? "正在提交…" : "提交答案"}
        </button>

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

        {result ? (
          <div className="next-area">
            {nextError ? <p className="inline-error" role="alert">{nextError}</p> : null}
            <button
              className="primary-button"
              type="button"
              disabled={advancing}
              onClick={isLastQuestion ? handleComplete : handleNext}
            >
              {advancing ? "正在加载…" : isLastQuestion ? "完成练习" : nextError ? "重试下一题" : "下一题"}
              {!advancing ? <span aria-hidden="true">→</span> : null}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
