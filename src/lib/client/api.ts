import type {
  AnswerRequest,
  AnswerResult,
  ApiError,
  ApiErrorCode,
  QuestionPayload,
  QuestionSummary,
} from "@/types/quiz";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: ApiErrorCode,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const error = (value as Record<string, unknown>).error;
  return Boolean(
    error &&
      typeof error === "object" &&
      !Array.isArray(error) &&
      typeof (error as Record<string, unknown>).code === "string" &&
      typeof (error as Record<string, unknown>).message === "string",
  );
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new ApiRequestError("服务返回了无法读取的响应，请稍后重试", response.status);
  }

  if (!response.ok) {
    if (isApiError(body)) {
      throw new ApiRequestError(body.error.message, response.status, body.error.code);
    }
    throw new ApiRequestError("请求失败，请稍后重试", response.status);
  }

  return body as T;
}

export function fetchBanks(): Promise<QuestionSummary[]> {
  return fetchJson<QuestionSummary[]>("/api/banks");
}

export function fetchQuestion(bankId: string, position: number): Promise<QuestionPayload> {
  return fetchJson<QuestionPayload>(
    `/api/banks/${encodeURIComponent(bankId)}/questions/${position}`,
  );
}

export function submitAnswer(
  bankId: string,
  questionId: string,
  answer: AnswerRequest,
): Promise<AnswerResult> {
  return fetchJson<AnswerResult>(
    `/api/banks/${encodeURIComponent(bankId)}/questions/${encodeURIComponent(questionId)}/answer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    },
  );
}
