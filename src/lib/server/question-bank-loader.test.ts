// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadQuestionBanks,
  QuestionBankLoadError,
} from "@/lib/server/question-bank-loader.mjs";
import type { QuestionBank } from "@/types/quiz";

const temporaryDirectories: string[] = [];

function makeDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "quizx-loader-"));
  temporaryDirectories.push(directory);
  return directory;
}

function validBank(id = "bank-a"): QuestionBank {
  return {
    id,
    title: id === "bank-a" ? "甲题库" : "乙题库",
    description: "用于测试的合法题库",
    version: 1,
    questions: [
      {
        id: "q1",
        type: "single",
        stemMd: "测试题干",
        options: [
          { id: "A", text: "正确" },
          { id: "B", text: "错误" },
        ],
        correctOptionIds: ["A"],
        explanationMd: "A 是正确答案，B 是干扰项。",
      },
    ],
  };
}

function writeBank(directory: string, fileName: string, bank: unknown): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, fileName), JSON.stringify(bank), "utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadQuestionBanks", () => {
  it("loads valid JSON and deeply freezes in-memory content", () => {
    const directory = makeDirectory();
    writeBank(directory, "valid.json", validBank());

    const banks = loadQuestionBanks(directory);

    expect(banks).toHaveLength(1);
    expect(Object.isFrozen(banks)).toBe(true);
    expect(Object.isFrozen(banks[0].questions[0].options)).toBe(true);

    writeBank(directory, "valid.json", { ...validBank(), title: "磁盘已修改" });
    expect(banks[0].title).toBe("甲题库");
  });

  it("allows a missing or empty directory", () => {
    const directory = makeDirectory();
    expect(loadQuestionBanks(path.join(directory, "missing"))).toEqual([]);
    expect(loadQuestionBanks(directory)).toEqual([]);
  });

  it("reports the file and syntax location for malformed JSON", () => {
    const directory = makeDirectory();
    const filePath = path.join(directory, "broken.json");
    writeFileSync(filePath, "{", "utf8");

    expect(() => loadQuestionBanks(directory)).toThrowError(QuestionBankLoadError);
    expect(() => loadQuestionBanks(directory)).toThrow(/broken\.json JSON 语法位置/);
  });

  it("reports a JSON pointer when the schema rejects a field", () => {
    const directory = makeDirectory();
    writeBank(directory, "extra.json", { ...validBank(), level: "beginner" });

    expect(() => loadQuestionBanks(directory)).toThrow(/extra\.json \/level:.*additionalProperties/);
  });

  it("rejects duplicate IDs and dangling answer references", () => {
    const duplicateDirectory = makeDirectory();
    const duplicate = validBank();
    duplicate.questions[0].options[1].id = "A";
    writeBank(duplicateDirectory, "duplicate-option.json", duplicate);
    expect(() => loadQuestionBanks(duplicateDirectory)).toThrow(/options\/1\/id.*重复/);

    const referenceDirectory = makeDirectory();
    const dangling = validBank();
    dangling.questions[0].correctOptionIds = ["missing"];
    writeBank(referenceDirectory, "dangling.json", dangling);
    expect(() => loadQuestionBanks(referenceDirectory)).toThrow(/correctOptionIds\/0.*不存在/);
  });

  it("rejects duplicate bank IDs across files without partially loading", () => {
    const directory = makeDirectory();
    writeBank(directory, "first.json", validBank());
    writeBank(directory, "second.json", { ...validBank(), title: "重复题库" });

    expect(() => loadQuestionBanks(directory)).toThrow(/second\.json \/id:.*first\.json.*重复/);
  });
});
