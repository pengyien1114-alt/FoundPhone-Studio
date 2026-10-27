import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/story-example/story.json", import.meta.url),
    "utf8",
  ),
);
import { compileStory } from "../src/story-engine/compiler";
test.beforeEach(async ({ page }) => {
  await page.route("**/work.json", (route) =>
    route.fulfill({ json: compileStory(fixture).work }),
  );
});
import { test, expect, type Page } from "@playwright/test";
async function home(page: Page) {
  await page.getByRole("button", { name: "返回桌面", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "打开设置", exact: true }),
  ).toBeVisible();
}
async function open(page: Page, name: string) {
  await page.getByRole("button", { name: "打开" + name, exact: true }).click();
  await expect(page.locator(".app-screen:not([inert])")).toBeVisible();
  await expect(page.locator(".app-screen:not([inert])")).toHaveCSS(
    "transform",
    "none",
  );
}
test("direct player, settings stack and toggle, system screenshots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "轻触解锁" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建作品" })).toHaveCount(0);
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.6/lock.png" });
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await expect(
    page.getByRole("button", { name: "打开设置", exact: true }),
  ).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.6/home.png" });
  await open(page, "设置");
  await expect(
    page.getByRole("switch", { name: "飞行模式" }),
  ).not.toBeChecked();
  await page.getByRole("switch", { name: "飞行模式" }).check();
  await expect(page.getByRole("switch", { name: "飞行模式" })).toBeChecked();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.6/settings.png" });
  await page.getByRole("button", { name: "通用", exact: true }).click();
  await page.getByRole("button", { name: "关于本机", exact: true }).click();
  await expect(page.getByText("iPhone 15 Pro", { exact: true })).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.6/settings-about.png" });
  await page.getByRole("button", { name: "通用", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "关于本机", exact: true }),
  ).toBeVisible();
  await home(page);
  for (const app of [
    "信息",
    "相册",
    "电话",
    "备忘录",
    "通讯录",
    "日历",
    "时钟",
    "计算器",
    "文件",
    "浏览器",
    "相机",
  ]) {
    await open(page, app);
    await page
      .locator(".phone-screen")
      .screenshot({ path: "outputs/v0.6/app-" + app + ".png" });
    await home(page);
  }
  expect(errors).toEqual([]);
});
for (const [choice, ending] of [
  ["赴约", "赴约：你按时把手机交还了主人。"],
  ["留在失物招领", "等待：你留下联系方式，等主人取回手机。"],
])
  test(
    "example puzzle, call, ending and persisted save: " + choice,
    async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "轻触解锁" }).click();
      await open(page, "微信");
      await page
        .locator(".wx-chat-row")
        .filter({ hasText: "小林" })
        .first()
        .click();
      await page
        .getByRole("button", {
          name: "密码还是我们第一次开会的日期：1023。",
          exact: true,
        })
        .click();
      await home(page);
      await open(page, "相册");
      await expect(
        page.getByRole("button", { name: "查看藏起来的照片" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "查看藏起来的照片" }).click();
      await expect(page.locator(".native-detail-photos")).toBeVisible();
      await page
        .locator(".phone-screen")
        .screenshot({ path: "outputs/v0.6/photos-detail.png" });
      await home(page);
      await open(page, "备忘录");
      await page
        .locator(".notes-list button")
        .filter({ hasText: "明天的安排" })
        .click();
      await page.getByPlaceholder("内容密码").fill("bad");
      await page.getByRole("button", { name: "解锁内容", exact: true }).click();
      await expect(page.getByText("密码不正确")).toBeVisible();
      await page.getByPlaceholder("内容密码").fill("1023");
      await page.getByRole("button", { name: "解锁内容", exact: true }).click();
      await expect(page.locator(".native-note-paper")).toBeVisible();
      await page
        .locator(".native-note-paper")
        .screenshot({ path: "outputs/v0.6/notes-detail.png" });
      await page.getByRole("button", { name: "接听", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "赴约", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "挂断", exact: true }).click();
      await page.getByRole("button", { name: choice, exact: true }).click();
      await expect(page.getByText(ending, { exact: true })).toBeVisible();
      await page
        .locator(".phone-screen")
        .screenshot({ path: `outputs/v0.6/ending-${choice}.png` });
      await page.reload();
      await expect(page.locator(".lock-clock-block")).toContainText("10月24日");
      await page.getByRole("button", { name: "轻触解锁" }).click();
      await expect(page.getByText(ending, { exact: true })).toBeVisible();
    },
  );
test("mobile viewport, no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await expect(
    page.getByRole("button", { name: "打开设置", exact: true }),
  ).toBeVisible();
  const rect = await page.locator(".phone-shell").boundingBox();
  expect(rect!.width).toBeLessThanOrEqual(390);
  expect(rect!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "outputs/v0.6/mobile.png" });
});
test("production PWA cached story works after offline reload", async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  try {
    const page = await context.newPage();
    const productionWork = await context.request
      .get("http://127.0.0.1:4173/work.json")
      .then((r) => r.json());
    await page.goto("/");
    await page.getByRole("button", { name: "轻触解锁" }).waitFor();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "轻触解锁" }).click();
    if (productionWork.phone.passcode) {
      await page
        .getByRole("textbox", { name: "锁屏密码" })
        .fill(productionWork.phone.passcode);
      await page.getByRole("textbox", { name: "锁屏密码" }).press("Enter");
    }
    await open(page, "设置");
    await expect(page.getByRole("switch", { name: "飞行模式" })).toBeVisible();
    await page
      .locator(".phone-screen")
      .screenshot({ path: "outputs/v0.6/offline-settings.png" });
  } finally {
    await context.close();
  }
});

test("blank phone contains no story or author content", async ({
  page,
  request,
}) => {
  await page.unroute("**/work.json");
  const w = await request.get("/blank-work.json").then((r) => r.json());
  expect(w.id).toBe("blank-phone");
  expect(w.nodes).toEqual([]);
  expect(Object.values(w.data).flat()).toEqual([]);
  expect(w.description).toBe("");
  expect(w.mode).toBe("explore");
  await page.goto("/?template=blank");
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await expect(page.getByText("林知夏", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "打开设置", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".lock-screen")).toHaveCount(0);
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.7/blank-home.png" });
  await open(page, "设置");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.7/settings-blank.png" });
});
test("reference-calibrated settings, WeChat pages and control center", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await open(page, "设置");
  const screen = await page.locator(".phone-screen").boundingBox();
  const search = await page.locator(".settings-search").boundingBox();
  expect(search!.y).toBeGreaterThan(screen!.y + screen!.height * 0.75);
  await expect(page.locator(".settings-group").first()).toHaveCSS(
    "border-radius",
    "26px",
  );
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.7/settings.png" });
  await home(page);
  await page.getByRole("button", { name: "控制中心", exact: true }).click();
  await expect(page.locator(".device-control")).toHaveCSS("opacity", "1");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.7/control-center.png" });
  await page.getByRole("button", { name: "关闭控制中心" }).click();
  await expect(page.locator(".device-control")).toHaveCount(0);
  await open(page, "微信");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.7/wechat-list-fixture.png" });
  await page.locator(".wx-bottom button").filter({ hasText: "发现" }).click();
  await expect(
    page.getByRole("button", { name: "视频号", exact: false }),
  ).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.7/wechat-discover.png" });
  await page.locator(".wx-bottom button").filter({ hasText: "我" }).click();
  await expect(
    page.getByRole("button", { name: "小店与卡包", exact: false }),
  ).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.7/wechat-me-fixture.png" });
});
