import type { QuestionType } from "@/types/quiz";

export const QUESTION_TYPE_ORDER = ["single", "judgment", "multiple"] as const satisfies readonly QuestionType[];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "单选题",
  judgment: "判断题",
  multiple: "多选题",
};
