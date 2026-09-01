import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const schemaPath = path.join(process.cwd(), "data", "question-bank.schema.json");
let questionBankSchema;
try {
  questionBankSchema = JSON.parse(readFileSync(schemaPath, "utf8"));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  throw new Error(`[QuizX] ${schemaPath} /: 无法读取 JSON Schema：${reason}`);
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(questionBankSchema);

export class QuestionBankLoadError extends Error {
  constructor(filePath, location, reason) {
    super(`[QuizX] ${filePath} ${location}: ${reason}`);
    this.name = "QuestionBankLoadError";
    this.filePath = filePath;
    this.location = location;
    this.reason = reason;
  }
}

export function getDefaultQuestionBankDirectory() {
  return path.join(process.cwd(), "data", "question-banks");
}

function escapeJsonPointer(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function getErrorLocation(error) {
  if (error.keyword === "required") {
    return `${error.instancePath}/${escapeJsonPointer(String(error.params.missingProperty))}`;
  }

  if (error.keyword === "additionalProperties") {
    return `${error.instancePath}/${escapeJsonPointer(String(error.params.additionalProperty))}`;
  }

  return error.instancePath || "/";
}

function formatSchemaError(error) {
  const details = error.message ?? `不符合 ${error.keyword} 规则`;
  return `${details}（规则：${error.keyword}）`;
}

function parseQuestionBank(filePath) {
  let source;

  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new QuestionBankLoadError(filePath, "/", `无法读取文件：${reason}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new QuestionBankLoadError(filePath, "JSON 语法位置", reason);
  }
}

function assertSemanticRules(bank, filePath) {
  const questionIds = new Set();

  bank.questions.forEach((question, questionIndex) => {
    const questionPath = `/questions/${questionIndex}`;

    if (questionIds.has(question.id)) {
      throw new QuestionBankLoadError(
        filePath,
        `${questionPath}/id`,
        `题目 ID “${question.id}” 在当前题库内重复`,
      );
    }
    questionIds.add(question.id);

    const optionIds = new Set();
    question.options.forEach((option, optionIndex) => {
      if (optionIds.has(option.id)) {
        throw new QuestionBankLoadError(
          filePath,
          `${questionPath}/options/${optionIndex}/id`,
          `选项 ID “${option.id}” 在当前题目内重复`,
        );
      }
      optionIds.add(option.id);
    });

    question.correctOptionIds.forEach((optionId, answerIndex) => {
      if (!optionIds.has(optionId)) {
        throw new QuestionBankLoadError(
          filePath,
          `${questionPath}/correctOptionIds/${answerIndex}`,
          `正确答案引用了不存在的选项 “${optionId}”`,
        );
      }
    });
  });
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function loadQuestionBanks(directory = getDefaultQuestionBankDirectory()) {
  let fileNames;

  try {
    fileNames = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new QuestionBankLoadError(
      directory,
      "/",
      `无法扫描题库目录：${reason}`,
    );
  }

  const bankFiles = new Map();
  const banks = [];

  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    const parsed = parseQuestionBank(filePath);

    if (!validateSchema(parsed)) {
      const firstError = validateSchema.errors?.[0];
      if (!firstError) {
        throw new QuestionBankLoadError(filePath, "/", "题库不符合 JSON Schema");
      }
      throw new QuestionBankLoadError(
        filePath,
        getErrorLocation(firstError),
        formatSchemaError(firstError),
      );
    }

    assertSemanticRules(parsed, filePath);

    const previousFile = bankFiles.get(parsed.id);
    if (previousFile) {
      throw new QuestionBankLoadError(
        filePath,
        "/id",
        `题库 ID “${parsed.id}” 与文件 ${previousFile} 重复`,
      );
    }

    bankFiles.set(parsed.id, filePath);
    banks.push(deepFreeze(parsed));
  }

  return deepFreeze(banks);
}
