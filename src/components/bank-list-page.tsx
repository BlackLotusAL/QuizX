"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchBanks } from "@/lib/client/api";
import {
  reconcileProgress,
  setBankProgress,
} from "@/lib/client/progress";
import type { ProgressState, QuestionSummary } from "@/types/quiz";

interface BankListPageProps {
  initialNotice?: string;
}

export function BankListPage({ initialNotice }: BankListPageProps) {
  const router = useRouter();
  const [banks, setBanks] = useState<QuestionSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressState>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const [loading, setLoading] = useState(true);

  const loadBanks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const loadedBanks = await fetchBanks();
      const reconciled = reconcileProgress(loadedBanks);
      setBanks(loadedBanks);
      setProgress(reconciled.progress);
      if (reconciled.legacyReset) {
        setNotice("题目导航已更新，将从第 1 题开始");
      } else if (reconciled.updatedBankIds.length > 0) {
        setNotice("题库已更新，将从第 1 题开始");
      }
    } catch {
      setError("题库加载失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBanks(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBanks]);

  function handleOpenBank(bank: QuestionSummary): void {
    const entry = progress[bank.id];
    const nextProgress = setBankProgress(bank.id, {
      bankVersion: bank.version,
      currentPosition: entry?.currentPosition ?? 1,
      attempts: entry?.attempts ?? {},
    });
    setProgress(nextProgress);
    router.push(`/practice/${encodeURIComponent(bank.id)}`);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">QUIZX</p>
        <h1>选择题库，开始练习</h1>
        <p className="page-intro">一次专注一道题，提交后立即理解答案。</p>
      </header>

      {notice ? (
        <div className="notice" role="status">
          <span aria-hidden="true">i</span>
          <p>{notice}</p>
        </div>
      ) : null}

      {loading ? (
        <section className="state-card" aria-live="polite">
          <p className="state-kicker">正在读取</p>
          <h2>正在加载题库…</h2>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="state-card state-card--error" role="alert">
          <p className="state-kicker">加载失败</p>
          <h2>{error}</h2>
          <button className="primary-button compact-button" type="button" onClick={loadBanks}>
            重试
          </button>
        </section>
      ) : null}

      {!loading && !error && banks?.length === 0 ? (
        <section className="state-card">
          <p className="state-kicker">暂无内容</p>
          <h2>暂无可用题库</h2>
          <p>添加合法的题库 JSON 并重启服务后即可开始练习。</p>
        </section>
      ) : null}

      {!loading && !error && banks && banks.length > 0 ? (
        <section className="bank-list" aria-label="可用题库">
          {banks.map((bank) => {
            const entry = progress[bank.id];
            const buttonText = entry ? "继续练习" : "开始练习";

            return (
              <article className="bank-card" key={bank.id}>
                <div>
                  <h2>{bank.title}</h2>
                  <p>{bank.description}</p>
                </div>
                <p className="question-count">共 {bank.questionCount} 题</p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => handleOpenBank(bank)}
                >
                  {buttonText}
                  <span aria-hidden="true">→</span>
                </button>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
