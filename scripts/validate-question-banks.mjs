import { loadQuestionBanks } from "../src/lib/server/question-bank-loader.mjs";

const banks = loadQuestionBanks();
console.info(`[QuizX] 启动校验通过：${banks.length} 个题库`);
