import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { compileStory } from "../src/story-engine/compiler";
test.use({ hasTouch: true });
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/mymy-ui/story.json", import.meta.url),
    "utf8",
  ),
);
async function start(page: Page) {
  await page.route("**/work.json*", (r) =>
    r.fulfill({ json: compileStory(fixture).work }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "轻触解锁" }).click();
}
async function open(page: Page, name: string) {
  await page.getByRole("button", { name: "打开App Store", exact: true }).click();
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
async function home(page: Page) {
  await page.getByRole("button", { name: "返回桌面", exact: true }).click();
  await expect(page.locator(".app-screen")).toHaveCount(0);
}
test("Mymy KKT read triggers call and cross-app authored Instagram unlock", async ({
  page,
}) => {
  await start(page);
  await open(page, "KakaoTalk");
  await expect(page.locator("[data-mymy=kakao]")).toBeVisible();
  await page.getByRole("button", { name: "好友", exact: true }).first().click();
  await page.locator(".kzkcr").click();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/mymy/kkt-chat.png" });
  await page
    .getByRole("button", { name: "点击这条测试消息触发来电。", exact: true })
    .click();
  await expect(page.locator(".incoming-call-screen")).toBeVisible();
  await page.getByRole("button", { name: "接听", exact: false }).click();
  await page.getByRole("button", { name: "挂断", exact: false }).click();
  await home(page);
  await open(page, "Instagram");
  await expect(
    page.getByText("挂断后出现的测试动态。", { exact: false }),
  ).toBeVisible();
});
test("Mymy Instagram comments, likes, profile, stories and X interaction persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await open(page, "Instagram");
  await page.getByRole("button", { name: "点赞测试帖子", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "点赞测试帖子", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "评论测试帖子", exact: true }).click();
  await page.getByRole("textbox", { name: "添加评论" }).fill("本地测试回复");
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await expect(
    page.locator(".mymy-comments p").filter({ hasText: "本地测试回复" }),
  ).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/mymy/instagram-comments.png" });
  await page.getByRole("button", { name: "关闭评论面板" }).click();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/mymy/instagram-feed.png" });
  await page.locator(".st").first().click();
  await expect(page.locator(".mymy-story")).toBeVisible();
  await page.getByRole("button", { name: "关闭快拍" }).click();
  await page.getByRole("button", { name: "个人主页", exact: true }).click();
  await expect(page.locator(".pg2")).toBeVisible();
  await home(page);
  await open(page, "X");
  await page.getByRole("button", { name: "点赞测试帖子", exact: true }).click();
  await page.getByRole("button", { name: "转发测试帖子", exact: true }).click();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/mymy/x-feed.png" });
  await page.locator(".kzxx").click();
  await expect(page.locator(".x-post-detail")).toBeVisible();
  await expect(page.getByRole("button", { name: "喜欢帖子" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await home(page);
  await page.reload();
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await open(page, "Instagram");
  await page.getByRole("button", { name: "主页", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "点赞测试帖子", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
test("mobile Mymy KKT layout and touch controls", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await start(page);
  await open(page, "KakaoTalk");
  await page.locator(".kzkcr").click();
  await expect(page.locator(".kzbub")).toHaveCount(2);
  const bounds = await page.locator(".kzinp").boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(393);
  await page
    .getByRole("textbox", { name: "KKT消息", exact: true })
    .fill("本地发送测试");
  await page.getByRole("button", { name: "发送KKT消息" }).click();
  await expect(
    page.getByRole("button", { name: "本地发送测试", exact: true }),
  ).toBeVisible();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/mymy/mobile-kkt.png" });
});
