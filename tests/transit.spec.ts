import { test, expect, type Page } from "@playwright/test";
async function unlock(page: Page) {
  await page.getByRole("button", { name: "轻触解锁" }).click();
  for (const n of "0112")
    await page.getByRole("button", { name: "密码键" + n, exact: true }).click();
}
async function open(page: Page, name: string) {
  const icon = page.getByRole("button", { name: "打开" + name, exact: true });
  if (!(await icon.isVisible())) {
    await page.locator(".home-search").click();
    await page
      .locator(".system-panel")
      .getByRole("button", { name, exact: true })
      .click();
    return;
  }
  await icon.click();
}
async function home(page: Page) {
  await page.getByRole("button", { name: "返回桌面", exact: true }).click();
}
for (const late of [false, true])
  test(`first day and persisted setup: late X ${late}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await unlock(page);
    await open(page, "X");
    await expect(page.locator(".kzxt")).toHaveCount(9);
    await expect(page.getByLabel("置頂推文")).toBeVisible();
    await home(page);
    await open(page, "备忘录");
    await page.getByRole("button", { name: /01｜入住前的秘密備忘錄/ }).click();
    await expect(page.locator(".story-profile img")).toHaveCount(0);
    await page.getByRole("textbox", { name: "你的姓名" }).fill("小雨");
    for (const name of [
      "金俊抒",
      "張家豪",
      "李理悟",
      "李相沅",
      "賀鑫隆",
      "周安信",
    ])
      await page.getByRole("checkbox", { name, exact: true }).check();
    await expect(
      page.getByRole("checkbox", { name: "鄭相炫", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("前任 X", { exact: true }).selectOption("金俊抒");
    if (late)
      await page.getByRole("checkbox", { name: "X 是後期登場的鯰魚" }).check();
    await page.getByRole("button", { name: "保存設定，開始第一天" }).click();
    await expect(
      page.getByText("初始復合 50% ／換乘 50%", { exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await unlock(page);
    await open(page, "备忘录");
    await page.getByRole("button", { name: /01｜入住前的秘密備忘錄/ }).click();
    await expect(
      page.getByText("初始復合 50% ／換乘 50%", { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `outputs/transit/setup-${late}.png` });
    await home(page);
    // Opening X uses its existing tweet detail to introduce the official story.
    await open(page, "X");
    await expect(page.locator(".app-post-detail").first()).toBeVisible();
    await expect(
      page.locator(".post-detail-body").getByText(/DAY 1 入住直播/),
    ).toBeVisible();
    await home(page);
    await open(page, "KakaoTalk");
    await page
      .locator(".mymy-kakao button")
      .filter({ hasText: "合宿節目組" })
      .first()
      .click();
    for (const [prompt, option] of [
      ["18:00｜", "邀請 張家豪 一起準備晚餐"],
      ["20:00｜", "把介紹信收好，選擇向前看"],
      ["23:00｜", "向 張家豪 表達今天的感謝"],
    ]) {
      await page.locator(".kzbub").filter({ hasText: prompt }).click();
      await page
        .locator(".story-overlay")
        .getByRole("button", { name: option })
        .click();
      await home(page);
      await open(page, "X");
      await expect(
        page
          .locator(".post-detail-author")
          .getByText("換乘戀愛官方", { exact: true }),
      ).toBeVisible();
      await home(page);
      await open(page, "KakaoTalk");
      await page
        .locator(".mymy-kakao button")
        .filter({ hasText: "合宿節目組" })
        .first()
        .click();
    }
    await page.screenshot({ path: `outputs/transit/kakao-${late}.png` });
    await home(page);
    await open(page, "备忘录");
    await page.getByRole("button", { name: /03｜我的心意紀錄/ }).click();
    await expect(page.getByText(/目前復合 5% ／換乘 95%/)).toBeVisible();
    await home(page);
    await open(page, "浏览器");
    await page.getByRole("button", { name: /theqoo｜睡前討論/ }).click();
    await expect(page.getByText(/接行李那一對今晚有後續嗎/)).toBeVisible();
    await page.screenshot({ path: `outputs/transit/theqoo-${late}.png` });
    await home(page);
    await open(page, "X");
    await expect(page.locator(".mymy-x")).toContainText(
      "謝謝你今天接過我的行李",
    );
    await expect(page.locator(".mymy-x")).not.toContainText("{{");
    await page.screenshot({ path: `outputs/transit/x-${late}.png` });
    expect(errors).toEqual([]);
  });
