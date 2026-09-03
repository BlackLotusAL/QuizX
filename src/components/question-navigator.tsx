"use client";

import { useRef } from "react";

import { QUESTION_TYPE_LABELS } from "@/lib/question-types";
import type { QuestionAttempt, QuestionSection } from "@/types/quiz";

interface QuestionNavigatorProps {
  attempts: Record<string, QuestionAttempt>;
  currentPosition: number;
  navigating: boolean;
  sections?: QuestionSection[];
  total: number;
  onClear: () => Promise<void>;
  onNavigate: (position: number) => Promise<boolean>;
}

interface NavigatorContentProps extends QuestionNavigatorProps {
  idPrefix: string;
  onSelect: (position: number) => Promise<boolean>;
}

function openDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog || dialog.open) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog || !dialog.open) {
    return;
  }
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function NavigatorContent({
  attempts,
  currentPosition,
  idPrefix,
  navigating,
  sections,
  total,
  onClear,
  onSelect,
}: NavigatorContentProps) {
  const submittedCount = Object.values(attempts).filter((attempt) => attempt.result).length;
  const hasRecords = currentPosition !== 1 || Object.keys(attempts).length > 0;
  const availableSections = sections ?? [];

  return (
    <>
      <div className="question-nav-sections">
        {availableSections.map((section) => {
          const headingId = `${idPrefix}-${section.type}`;
          return (
            <section className="question-nav-section" aria-labelledby={headingId} key={section.type}>
              <div className="question-nav-section-heading">
                <h3 id={headingId}>{QUESTION_TYPE_LABELS[section.type]}</h3>
                <span>{section.count} 题</span>
              </div>
              <div className="question-number-grid">
                {Array.from({ length: section.count }, (_, index) => {
                  const position = section.startPosition + index;
                  const attempt = attempts[String(position)];
                  const status = attempt?.result ? "submitted" : attempt ? "draft" : "unanswered";
                  const statusLabel = status === "submitted"
                    ? "已提交"
                    : status === "draft"
                      ? "已选择，未提交"
                      : "未作答";

                  return (
                    <button
                      aria-current={position === currentPosition ? "step" : undefined}
                      aria-label={`第 ${position} 题，${QUESTION_TYPE_LABELS[section.type]}，${statusLabel}`}
                      className={`question-number question-number--${status}`}
                      disabled={navigating}
                      key={position}
                      type="button"
                      onClick={() => void onSelect(position)}
                    >
                      <span>{position}</span>
                      {status === "submitted" ? (
                        <span className="question-number-status" aria-hidden="true">✓</span>
                      ) : null}
                      {status === "draft" ? (
                        <span className="question-number-dot" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="question-nav-footer">
        <p>已提交 <strong>{submittedCount}</strong> / {total}</p>
        {hasRecords ? (
          <button
            className="clear-progress-button"
            disabled={navigating}
            type="button"
            onClick={() => void onClear()}
          >
            清空答题记录
          </button>
        ) : null}
      </div>
    </>
  );
}

export function QuestionNavigator(props: QuestionNavigatorProps) {
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const clearDialogRef = useRef<HTMLDialogElement>(null);

  async function selectFromMobile(position: number): Promise<boolean> {
    const didNavigate = await props.onNavigate(position);
    if (didNavigate || position === props.currentPosition) {
      closeDialog(mobileDialogRef.current);
    }
    return didNavigate;
  }

  async function requestClear(): Promise<void> {
    closeDialog(mobileDialogRef.current);
    openDialog(clearDialogRef.current);
  }

  async function confirmClear(): Promise<void> {
    closeDialog(clearDialogRef.current);
    await props.onClear();
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="mobile-navigator-trigger"
        disabled={props.navigating}
        type="button"
        onClick={() => openDialog(mobileDialogRef.current)}
      >
        <span>题目导航</span>
        <strong>{props.currentPosition} / {props.total}</strong>
      </button>

      <aside className="question-navigator question-navigator--desktop" aria-label="题目导航">
        <h2>题目导航</h2>
        <NavigatorContent {...props} idPrefix="desktop-section" onSelect={props.onNavigate} onClear={requestClear} />
      </aside>

      <dialog
        aria-labelledby="mobile-navigator-title"
        className="question-navigator-dialog"
        ref={mobileDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog(mobileDialogRef.current);
        }}
        onClick={(event) => {
          if (event.currentTarget === event.target) {
            closeDialog(mobileDialogRef.current);
          }
        }}
      >
        <div className="question-navigator question-navigator--mobile">
          <div className="question-navigator-dialog-header">
            <h2 id="mobile-navigator-title">题目导航</h2>
            <button
              aria-label="关闭题目导航"
              className="dialog-close-button"
              type="button"
              onClick={() => closeDialog(mobileDialogRef.current)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <NavigatorContent {...props} idPrefix="mobile-section" onSelect={selectFromMobile} onClear={requestClear} />
        </div>
      </dialog>

      <dialog
        aria-labelledby="clear-progress-title"
        className="confirm-dialog"
        ref={clearDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog(clearDialogRef.current);
        }}
      >
        <h2 id="clear-progress-title">清空这套题的答题记录？</h2>
        <p>已选答案和解析将被删除，并回到第 1 题。</p>
        <div className="confirm-dialog-actions">
          <button className="secondary-button" type="button" onClick={() => closeDialog(clearDialogRef.current)}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={() => void confirmClear()}>
            确认清空
          </button>
        </div>
      </dialog>
    </>
  );
}
