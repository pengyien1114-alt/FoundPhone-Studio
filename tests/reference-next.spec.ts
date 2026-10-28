import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { compileStory } from "../src/story-engine/compiler";
const blank = JSON.parse(
  readFileSync(new URL("../stories/blank/story.json", import.meta.url), "utf8"),
);
async function enter(page: Page) {
  const story = structuredClone(blank);
  story.id = "reference-social-ui";
  story.installedApps.push("threads", "twitter");
  story.content.threads = [
    {
      id: "thread-feed",
      title: "测试串文",
      body: "这是一条用于布局校准的测试串文。",
      sender: "测试用户",
      likes: 2,
    },
    {
      id: "thread-dm",
      title: "测试会话",
      body: "这是一条测试消息。",
      sender: "测试联系人",
      folder: "私信",
    },
    {
      id: "thread-activity",
      title: "测试动态",
      body: "这是一条测试回复动态。",
      sender: "测试用户",
      meta: { activityType: "reply" },
    },
  ];
  story.content.twitter = [
    {
      id: "x-reference",
      title: "测试帖子",
      body: "这是一条用于深色界面校准的测试帖子。",
      sender: "测试用户",
      comments: ["这是一条测试回复。"],
    },
  ];
  await page.route("**/work.json*", (r) =>
    r.fulfill({ json: compileStory(story).work }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "轻触解锁" }).click();
}
async function open(page: Page, name: string) {
  await page
    .getByRole("button", { name: "打开App Store", exact: true })
    .click();
  await page.getByPlaceholder("搜索全部App").fill(name);
  await page
    .locator(".runtime-library-row")
    .getByRole("button", { name: "打开", exact: true })
    .click();
  await expect(page.locator(".app-screen:not([inert])")).toHaveCSS(
    "transform",
    "none",
  );
}
test("home has no permanent toolbar, long press edits, App Store installs apps", async ({
  page,
}) => {
  await enter(page);
  await expect(
    page.getByRole("button", { name: "编辑桌面", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "打开App库", exact: true }),
  ).toHaveCount(0);
  const home = page.locator(".interactive-home");
  const box = await home.boundingBox();
  await page.mouse.move(box!.x + 200, box!.y + 740);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "添加小组件", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/home.png" });
  await page
    .getByRole("button", { name: "打开App Store", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "搜索", exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("搜索全部App").fill("抖音");
  await page.getByRole("button", { name: "获取", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "打开", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".interactive-home")).toHaveCSS("opacity", "1");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/app-store.png" });
});
test("Threads reference messages activity menu and composer persist local posts", async ({
  page,
}) => {
  await enter(page);
  await open(page, "Threads");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/threads-feed.png" });
  await page.getByRole("button", { name: "Threads消息", exact: true }).click();
  await expect(page.locator(".tr-message")).toContainText("测试消息");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/threads-messages.png" });
  await page.getByRole("button", { name: "Threads动态", exact: true }).click();
  await expect(page.locator(".tr-activity")).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/threads-activity.png" });
  await page.getByRole("button", { name: "Threads首页", exact: true }).click();
  await page.getByRole("button", { name: "打开Threads菜单" }).click();
  await expect(page.locator(".tr-side")).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/threads-menu.png" });
  await page.getByRole("button", { name: "关闭Threads菜单" }).click();
  await page.getByRole("button", { name: "新建串文", exact: true }).click();
  await page.getByRole("textbox", { name: "串文内容" }).fill("本地串文测试");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/threads-compose.png" });
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.locator(".tr-scroll")).toContainText("本地串文测试");
  await page.reload();
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await open(page, "Threads");
  await expect(page.locator(".tr-scroll")).toContainText("本地串文测试");
});
test("X reference dark feed and detail with optional light appearance", async ({
  page,
}) => {
  await enter(page);
  await open(page, "X");
  await expect(page.locator(".mymy-x")).toHaveClass(/x-reference-dark/);
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/x-dark-feed.png" });
  await page.getByRole("button", { name: "切换X外观" }).click();
  await expect(page.locator(".mymy-x")).not.toHaveClass(/x-reference-dark/);
  await page.getByRole("button", { name: "切换X外观" }).click();
  await page.locator(".kzxx").click();
  await expect(page.locator(".x-post-detail")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/reference-next/x-dark-detail.png" });
});
