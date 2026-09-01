import { apiError, jsonResponse } from "@/lib/server/api-response";
import { getQuestionBankRepository } from "@/lib/server/question-bank-repository";
import type { AnswerRequest } from "@/types/quiz";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ bankId: string; questionKey: string }>;
}

function isAnswerRequest(value: unknown): value is AnswerRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    Number.isSafeInteger(record.bankVersion) &&
    Number(record.bankVersion) >= 1 &&
    Array.isArray(record.selectedOptionIds) &&
    record.selectedOptionIds.every((optionId) => typeof optionId === "string")
  );
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { bankId, questionKey: questionId } = await context.params;
  const repository = getQuestionBankRepository();
  const bank = repository.getBank(bankId);

  if (!bank) {
    return apiError(404, "BANK_NOT_FOUND", "题库不存在，请返回题库页重新选择");
  }

  const question = repository.getQuestion(bankId, questionId);
  if (!question) {
    return apiError(404, "QUESTION_NOT_FOUND", "题目不存在，请重新加载当前题目");
  }

  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return apiError(400, "INVALID_ANSWER", "答案格式无效，请重新选择后提交");
  }

  if (!isAnswerRequest(body)) {
    return apiError(400, "INVALID_ANSWER", "答案格式无效，请重新选择后提交");
  }

  if (body.bankVersion !== bank.version) {
    return apiError(409, "BANK_VERSION_CHANGED", "题库已更新，将从第 1 题开始");
  }

  const selectedOptionIds = body.selectedOptionIds;
  const selectedSet = new Set(selectedOptionIds);
  const validOptionIds = new Set(question.options.map((option) => option.id));
  const hasInvalidOption = selectedOptionIds.some((optionId) => !validOptionIds.has(optionId));
  const hasInvalidCount =
    selectedOptionIds.length === 0 ||
    selectedSet.size !== selectedOptionIds.length ||
    (question.type !== "multiple" && selectedOptionIds.length !== 1);

  if (hasInvalidOption || hasInvalidCount) {
    return apiError(400, "INVALID_ANSWER", "答案无效，请检查所选选项后重试");
  }

  return jsonResponse(repository.grade(question, selectedOptionIds));
}
