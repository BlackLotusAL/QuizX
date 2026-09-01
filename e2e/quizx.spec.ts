import { expect, test } from "@playwright/test";

const bankId = "javascript-basics";

async function chooseAndSubmit(
  page: import("@playwright/test").Page,
  optionNames: Array<string | RegExp>,
): Promise<void> {
  for (const name of optionNames) {
    await page.getByLabel(name).check();
  }
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText(/回答(正确|错误)/)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("API contracts expose only safe data and return specified errors", async ({ request }) => {
  const banks = await request.get("/api/banks");
  expect(banks.status()).toBe(200);
  expect(banks.headers()["cache-control"]).toBe("no-store");
  const summaries = await banks.json();
  expect(summaries).toEqual([
    expect.objectContaining({ id: bankId, version: 1, questionCount: 6 }),
  ]);
  expect(JSON.stringify(summaries)).not.toContain("correctOptionIds");

  const question = await request.get(`/api/banks/${bankId}/questions/1`);
  expect(question.status()).toBe(200);
  const questionBody = await question.json();
  expect(questionBody.question.id).toBe("q001");
  expect(questionBody.question.correctOptionIds).toBeUndefined();
  expect(questionBody.question.explanationMd).toBeUndefined();

  const invalid = await request.post(`/api/banks/${bankId}/questions/q001/answer`, {
    data: { bankVersion: 1, selectedOptionIds: [] },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe("INVALID_ANSWER");

  const stale = await request.post(`/api/banks/${bankId}/questions/q001/answer`, {
    data: { bankVersion: 99, selectedOptionIds: ["B"] },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.code).toBe("BANK_VERSION_CHANGED");

  expect((await request.get("/api/banks/missing/questions/1")).status()).toBe(404);
  expect((await request.get(`/api/banks/${bankId}/questions/99`)).status()).toBe(404);
  expect((await request.get("/data/question-banks/javascript-basics.json")).status()).toBe(404);
});

test("completes all question types, resumes progress and restarts without scores", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "选择题库，开始练习" })).toBeVisible();
  await expect(page.getByRole("button", { name: /开始练习/ })).toBeVisible();
  await page.getByRole("button", { name: /开始练习/ }).click();

  await expect(page).toHaveURL(new RegExp(`/practice/${bankId}$`));
  await expect(page.getByRole("heading", { name: "第 1 题" })).toBeVisible();

  const wrongOption = page.getByLabel(/可以在同一作用域重复声明/);
  await wrongOption.focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("回答错误")).toBeVisible();
  await expect(page.getByText(/你的错选/)).toBeVisible();
  await expect(page.getByText(/正确答案/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "第 1 题" })).toBeVisible();
  await expect(page.getByText("回答错误")).not.toBeVisible();
  await chooseAndSubmit(page, [/绑定不能被重新赋值/]);
  await page.getByRole("button", { name: /下一题/ }).click();

  await expect(page.getByRole("heading", { name: "第 2 题" })).toBeVisible();
  await page.getByRole("link", { name: /返回题库/ }).click();
  await expect(page.getByRole("button", { name: /继续练习/ })).toBeVisible();
  await page.getByRole("button", { name: /继续练习/ }).click();
  await expect(page.getByRole("heading", { name: "第 2 题" })).toBeVisible();

  await chooseAndSubmit(page, ["==="]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await chooseAndSubmit(page, ["map", "filter"]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await chooseAndSubmit(page, ["string", "number", "boolean", "symbol"]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await chooseAndSubmit(page, ["错误"]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await chooseAndSubmit(page, ["正确"]);

  const progressBeforeCompletion = await page.evaluate((key) => localStorage.getItem(key), "quizx.progress");
  expect(JSON.parse(progressBeforeCompletion ?? "{}")[bankId].completed).toBe(false);

  await page.getByRole("button", { name: /完成练习/ }).click();
  await expect(page.getByRole("heading", { name: "练习完成" })).toBeVisible();
  await expect(page.getByText(/分数|成绩|正确率/)).not.toBeVisible();

  await page.locator(".completion-card").getByRole("link", { name: "返回题库" }).click();
  await expect(page.getByRole("button", { name: /重新练习/ })).toBeVisible();
  await page.getByRole("button", { name: /重新练习/ }).click();
  await expect(page.getByRole("heading", { name: "第 1 题" })).toBeVisible();
});

test("keeps answers and feedback when submit or next loading fails", async ({ page }) => {
  let answerAttempts = 0;
  let nextAttempts = 0;

  await page.route(`**/api/banks/${bankId}/questions/q001/answer`, async (route) => {
    answerAttempts += 1;
    if (answerAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INVALID_ANSWER", message: "提交暂时失败，请重试" } }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(`**/api/banks/${bankId}/questions/2`, async (route) => {
    nextAttempts += 1;
    if (nextAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "POSITION_NOT_FOUND", message: "下一题暂时无法加载，请重试" } }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`/practice/${bankId}`);
  const option = page.getByLabel(/绑定不能被重新赋值/);
  await option.check();
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("提交暂时失败，请重试")).toBeVisible();
  await expect(option).toBeChecked();
  await expect(page.getByRole("button", { name: "提交答案" })).toBeEnabled();

  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("回答正确")).toBeVisible();
  await page.getByRole("button", { name: /下一题/ }).click();
  await expect(page.getByText("下一题暂时无法加载，请重试")).toBeVisible();
  await expect(page.getByText("回答正确")).toBeVisible();

  const progressAfterFailure = await page.evaluate((key) => localStorage.getItem(key), "quizx.progress");
  expect(JSON.parse(progressAfterFailure ?? "{}")[bankId].nextPosition).toBe(1);

  await page.getByRole("button", { name: /重试下一题/ }).click();
  await expect(page.getByRole("heading", { name: "第 2 题" })).toBeVisible();
});

test("recovers from list, initial question and version-change failures", async ({ page }) => {
  let listAttempts = 0;
  await page.route("**/api/banks", async (route) => {
    listAttempts += 1;
    if (listAttempts === 1) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByText("题库加载失败，请检查网络后重试")).toBeVisible();
  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.getByRole("button", { name: /开始练习/ })).toBeVisible();
  await page.unroute("**/api/banks");

  let questionAttempts = 0;
  await page.route(`**/api/banks/${bankId}/questions/1`, async (route) => {
    questionAttempts += 1;
    if (questionAttempts === 1) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.goto(`/practice/${bankId}`);
  await expect(page.getByText(/Failed to fetch|题目加载失败/)).toBeVisible();
  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.getByRole("heading", { name: "第 1 题" })).toBeVisible();
  await page.unroute(`**/api/banks/${bankId}/questions/1`);

  await page.route(`**/api/banks/${bankId}/questions/q001/answer`, async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "BANK_VERSION_CHANGED", message: "题库已更新，将从第 1 题开始" },
      }),
    });
  });
  await page.getByLabel(/绑定不能被重新赋值/).check();
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("题库已更新，将从第 1 题开始")).toBeVisible();
  await expect(page.getByRole("heading", { name: "第 1 题" })).toBeVisible();

  await page.unroute(`**/api/banks/${bankId}/questions/q001/answer`);
  await page.goto("/practice/missing-bank");
  await expect(page).toHaveURL(/\/\?notice=bank-not-found$/);
  await expect(page.getByText("题库不存在或已被删除，请重新选择")).toBeVisible();
});
