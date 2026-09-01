export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeQuestionBankRepository } = await import(
      "@/lib/server/question-bank-repository"
    );
    const repository = initializeQuestionBankRepository();
    console.info(`[QuizX] 已加载 ${repository.getSummaries().length} 个题库`);
  }
}
