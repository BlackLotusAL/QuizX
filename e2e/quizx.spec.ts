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
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
});

test("API contracts expose grouped positions without leaking answers", async ({ request }) => {
  const banks = await request.get("/api/banks");
  expect(banks.status()).toBe(200);
  expect(banks.headers()["cache-control"]).toBe("no-store");
  const summaries = await banks.json();
  expect(summaries).toEqual([
    expect.objectContaining({ id: bankId, version: 2, questionCount: 6 }),
  ]);
  expect(JSON.stringify(summaries)).not.toContain("correctOptionIds");

  const question = await request.get(`/api/banks/${bankId}/questions/1`);
  expect(question.status()).toBe(200);
  const questionBody = await question.json();
  expect(questionBody.question.id).toBe("q001");
  expect(questionBody.sections).toEqual([
    { type: "single", startPosition: 1, count: 2 },
    { type: "judgment", startPosition: 3, count: 2 },
    { type: "multiple", startPosition: 5, count: 2 },
  ]);
  expect(questionBody.question.correctOptionIds).toBeUndefined();
  expect(questionBody.question.explanationMd).toBeUndefined();

  const judgment = await request.get(`/api/banks/${bankId}/questions/3`);
  expect((await judgment.json()).question.id).toBe("q005");
  const multiple = await request.get(`/api/banks/${bankId}/questions/5`);
  expect((await multiple.json()).question.id).toBe("q003");

  const invalid = await request.post(`/api/banks/${bankId}/questions/q001/answer`, {
    data: { bankVersion: 2, selectedOptionIds: [] },
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

test("navigates every question type, restores feedback and clears the ongoing practice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "选择题库，开始练习" })).toBeVisible();
  await page.getByRole("button", { name: /开始练习/ }).click();

  await expect(page).toHaveURL(new RegExp(`/practice/${bankId}$`));
  await expect(page.getByRole("heading", { name: "单选题，第 1 题" })).toBeVisible();
  const navigator = page.getByRole("complementary", { name: "题目导航" });
  await expect(navigator.getByRole("heading", { name: "判断题" })).toBeVisible();
  await expect(navigator.getByRole("heading", { name: "多选题" })).toBeVisible();

  const wrongOption = page.getByLabel(/可以在同一作用域重复声明/);
  await wrongOption.focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("回答错误")).toBeVisible();

  await navigator.getByRole("button", { name: "第 3 题，判断题，未作答" }).click();
  await expect(page.getByRole("heading", { name: "判断题，第 3 题" })).toBeVisible();
  await navigator.getByRole("button", { name: "第 1 题，单选题，已提交" }).click();
  await expect(page.getByText("回答错误")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "单选题，第 1 题" })).toBeVisible();
  await expect(page.getByText("回答错误")).toBeVisible();
  await expect(wrongOption).toBeChecked();
  await page.getByRole("button", { name: /下一题/ }).click();

  await expect(page.getByRole("heading", { name: "单选题，第 2 题" })).toBeVisible();
  await page.getByRole("link", { name: /返回题库/ }).click();
  await expect(page.getByRole("button", { name: /继续练习/ })).toBeVisible();
  await page.getByRole("button", { name: /继续练习/ }).click();
  await expect(page.getByRole("heading", { name: "单选题，第 2 题" })).toBeVisible();

  await chooseAndSubmit(page, ["==="]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await expect(page.getByRole("heading", { name: "判断题，第 3 题" })).toBeVisible();
  await chooseAndSubmit(page, ["错误"]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await chooseAndSubmit(page, ["正确"]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await expect(page.getByRole("heading", { name: "多选题，第 5 题" })).toBeVisible();
  await chooseAndSubmit(page, ["map", "filter"]);
  await page.getByRole("button", { name: /下一题/ }).click();
  await chooseAndSubmit(page, ["string", "number", "boolean", "symbol"]);

  await expect(navigator.getByText(/已提交\s*6\s*\/\s*6/)).toBeVisible();
  await expect(page.getByRole("button", { name: /下一题/ })).toBeDisabled();
  await expect(page.getByText("练习完成")).toHaveCount(0);

  await page.getByRole("link", { name: /返回题库/ }).click();
  await expect(page.getByRole("button", { name: /继续练习/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /重新练习/ })).toHaveCount(0);
  await page.getByRole("button", { name: /继续练习/ }).click();
  await expect(page.getByRole("heading", { name: "多选题，第 6 题" })).toBeVisible();
  await expect(page.getByText("回答正确")).toBeVisible();

  await page.getByRole("complementary", { name: "题目导航" })
    .getByRole("button", { name: "清空答题记录" })
    .click();
  const confirmation = page.getByRole("dialog", { name: "清空这套题的答题记录？" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "确认清空" }).click();
  await expect(page.getByRole("heading", { name: "单选题，第 1 题" })).toBeVisible();
  await expect(page.getByText(/回答(正确|错误)/)).toHaveCount(0);

  await page.getByRole("link", { name: /返回题库/ }).click();
  await expect(page.getByRole("button", { name: /开始练习/ })).toBeVisible();
});

test("uses the grouped bottom-sheet navigator on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/practice/${bankId}`);

  await expect(page.getByRole("complementary", { name: "题目导航" })).toBeHidden();
  const trigger = page.getByRole("button", { name: /题目导航.*1.*6/ });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "题目导航" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "单选题" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "判断题" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "多选题" })).toBeVisible();
  await dialog.getByRole("button", { name: "第 5 题，多选题，未作答" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "多选题，第 5 题" })).toBeVisible();
  await expect(page.getByRole("button", { name: /上一题/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /下一题/ })).toBeVisible();
});

test("keeps answers and feedback when submit or navigation loading fails", async ({ page }) => {
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

  const progressAfterFailure = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    "quizx.progress",
  );
  expect(JSON.parse(progressAfterFailure ?? "{}").banks[bankId].currentPosition).toBe(1);

  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.getByRole("heading", { name: "单选题，第 2 题" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "单选题，第 1 题" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "单选题，第 1 题" })).toBeVisible();

  await page.unroute(`**/api/banks/${bankId}/questions/q001/answer`);
  await page.goto("/practice/missing-bank");
  await expect(page).toHaveURL(/\/\?notice=bank-not-found$/);
  await expect(page.getByText("题库不存在或已被删除，请重新选择")).toBeVisible();
});
