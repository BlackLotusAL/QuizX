import { jsonResponse } from "@/lib/server/api-response";
import { getQuestionBankRepository } from "@/lib/server/question-bank-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return jsonResponse(getQuestionBankRepository().getSummaries());
}
