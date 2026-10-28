import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { compileStory } from "../src/story-engine/compiler";
test("development preview contains generic placeholders", async ({
  page,
  request,
}) => {
  const standard = await (await request.get("/blank-work.json")).json();
  const preview = compileStory(
    JSON.parse(readFileSync("stories/test-preview/story.json", "utf8")),
  ).work;
  await page.route("**/test-work.json*", (r) => r.fulfill({ json: preview }));
  expect(Object.values(standard.data).flat()).toHaveLength(0);
  expect(
    preview.apps.filter((a: { installed: boolean }) => a.installed),
  ).toHaveLength(49);
  expect(preview.id).not.toBe(standard.id);
  for (const app of preview.apps)
    expect(preview.data[app.id]?.length).toBeGreaterThan(0);
  await page.goto("/?preview=test");
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await page
    .getByRole("button", { name: "打开App Store", exact: true })
    .click();
  await expect(page.locator(".runtime-library-row")).toHaveCount(49);
  await page.getByRole("button", { name: "关闭App管理" }).click();
  await page.getByRole("button", { name: "控制中心", exact: true }).click();
  await expect(page.locator(".device-control")).toHaveCSS("opacity", "1");
  await expect(page.locator(".cc-small-connections button")).toHaveCount(4);
  const wifi = page.getByRole("button", { name: "Wi-Fi", exact: true });
  await wifi.click();
  await expect(wifi).toHaveAttribute("aria-pressed", "false");
  await wifi.click();
  await expect(wifi).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("slider", { name: "音量", exact: true }).fill("60");
  await expect(
    page.getByRole("slider", { name: "音量", exact: true }),
  ).toHaveValue("60");
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.9/control-center.png" });
  await page.getByRole("button", { name: "关闭控制中心" }).click();
  await page
    .locator(".phone-screen")
    .screenshot({ path: "outputs/v0.9/test-home.png" });
});
