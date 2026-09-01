import { apiError, jsonResponse } from "@/lib/server/api-response";
import { getQuestionBankRepository } from "@/lib/server/question-bank-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ bankId: string; questionKey: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { bankId, questionKey: rawPosition } = await context.params;
  const repository = getQuestionBankRepository();

  if (!repository.getBank(bankId)) {
    return apiError(404, "BANK_NOT_FOUND", "题库不存在，请返回题库页重新选择");
  }

  if (!/^[1-9]\d*$/.test(rawPosition)) {
    return apiError(404, "POSITION_NOT_FOUND", "题号不存在，请返回当前练习位置");
  }

  const position = Number(rawPosition);
  if (!Number.isSafeInteger(position)) {
    return apiError(404, "POSITION_NOT_FOUND", "题号不存在，请返回当前练习位置");
  }

  const payload = repository.getQuestionPayload(bankId, position);
  if (!payload) {
    return apiError(404, "POSITION_NOT_FOUND", "题号不存在，请返回当前练习位置");
  }

  return jsonResponse(payload);
}
