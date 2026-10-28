import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { compileStory } from "../src/story-engine/compiler";
import { originalIconFiles } from "../src/ios/originalIconFiles";
test("published icons match source bytes and decode on desktop and App Store", async ({
  page,
  request,
}) => {
  const manifestFile = existsSync("assets/app-icons/manifest.json")
    ? "assets/app-icons/manifest.json"
    : "work/original-icons/sources.json";
  test.skip(!existsSync(manifestFile), "未安装图标");
  const probe = await request.get("/icon-assets/camera.png");
  test.skip(
    !probe.ok() || !probe.headers()["content-type"]?.startsWith("image/"),
    "公开构建不带本地图标",
  );
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")).results;
  await Promise.all(
    Object.entries(originalIconFiles).map(async ([id, file]) => {
      const response = await request.get("/icon-assets/" + file);
      expect(response.ok(), id).toBe(true);
      expect(
        createHash("sha256")
          .update(await response.body())
          .digest("hex"),
        id,
      ).toBe(manifest[id].sha256);
    }),
  );
  await page.route("**/test-work.json*", (r) =>
    r.fulfill({
      json: compileStory(
        JSON.parse(readFileSync("stories/test-preview/story.json", "utf8")),
      ).work,
    }),
  );
  await page.goto("/?preview=test");
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await expect(page.locator("[data-original-icon]")).toHaveCount(48);
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll<HTMLImageElement>(".original-app-artwork"),
    ].every((i) => i.complete && i.naturalWidth > 0),
  );
  const fit = await page
    .locator("[data-original-icon=camera] img")
    .evaluate((i) => ({
      fit: getComputedStyle(i).objectFit,
      width: (i as HTMLImageElement).naturalWidth,
    }));
  expect(fit.fit).toBe("contain");
  expect(fit.width).toBeGreaterThan(100);
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/original-icons/home-original.png" });
  await page
    .getByRole("button", { name: "打开App Store", exact: true })
    .click();
  await page.getByPlaceholder("搜索全部App").fill("QQ");
  await expect(
    page.locator(".runtime-library-row [data-original-icon=qq]"),
  ).toBeVisible();
  await expect(page.locator(".interactive-home")).toHaveCSS("opacity", "1");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/original-icons/store-original.png" });
});
test("missing original image safely falls back without losing app action", async ({
  page,
  request,
}) => {
  const probe = await request.get("/icon-assets/camera.png");
  test.skip(!probe.ok(), "公开构建不带本地图标");
  await page.route("**/icon-assets/photos.png", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await expect(
    page.getByRole("button", { name: "打开相册", exact: true }).locator("svg"),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开相册", exact: true }).click();
  await expect(page.locator(".app-screen")).toBeVisible();
});
