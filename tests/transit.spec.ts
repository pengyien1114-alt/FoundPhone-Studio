import { readFileSync } from "node:fs";
import { compileStory } from "../src/story-engine/compiler";
import { initialRuntime, type Runtime } from "../src/schema";
import { dispatch, choose } from "../src/engine";
import {
  profileConfig,
  saveProfile,
  renderStoryItem,
} from "../src/story-forms/profile";
import { seasonValues, packSeasonAnswer } from "../src/story-forms/season";
import { test, expect, type Page } from "@playwright/test";
async function pin(page: Page) {
  for (const n of "0112")
    await page.getByRole("button", { name: "密码键" + n, exact: true }).click();
}
async function open(page: Page, name: string) {
  const icon = page.getByRole("button", { name: "打开" + name, exact: true });
  if (await icon.isVisible()) await icon.click();
  else {
    await page.locator(".home-search").click();
    await page
      .locator(".system-panel")
      .getByRole("button", { name, exact: true })
      .click();
  }
}
async function home(page: Page) {
  await page.getByRole("button", { name: "返回桌面", exact: true }).click();
}
async function next(page: Page) {
  await page.getByRole("button", { name: "下一題", exact: true }).click();
}
async function x(page: Page) {
  await home(page);
  await open(page, "X");
  await expect(page.locator(".app-post-detail")).toBeVisible();
}
async function kkt(page: Page) {
  await home(page);
  await open(page, "KakaoTalk");
  await expect(page.locator(".msgs.kk")).toBeVisible();
}
async function option(page: Page, choice?: string | number) {
  const field = page.getByRole("textbox", { name: "KKT消息", exact: true });
  await expect(field).toHaveAttribute("readonly", "");
  await field.click();
  const dialog = page.getByRole("dialog", { name: "回答選項" });
  await expect(dialog).toBeVisible();
  const button =
    typeof choice === "string"
      ? dialog.getByRole("button", { name: choice, exact: true })
      : dialog.getByRole("button").nth(choice || 0);
  const value = await button.innerText();
  await button.click();
  await expect(dialog).toHaveCount(0);
  return value;
}
async function action(page: Page, _question: string, choice: string) {
  await option(page, choice);
}
for (const late of [false, true])
  test(`choice-only opening and full first evening: late=${late}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.locator(".notice-open").first().click();
    await pin(page);
    await page.getByRole("button", { name: /01｜入住前的秘密備忘錄/ }).click();
    await page.getByLabel("你的姓名", { exact: true }).selectOption("小雨");
    await next(page);
    for (const name of [
      "金俊抒",
      "張家豪",
      "李理悟",
      "李相沅",
      "賀鑫隆",
      "周安信",
    ])
      await page.getByRole("checkbox", { name, exact: true }).check();
    await next(page);
    await page.getByLabel("前任 X", { exact: true }).selectOption("金俊抒");
    await next(page);
    if (late)
      await page.getByRole("checkbox", { name: "安排於後續入場" }).check();
    await next(page);
    await next(page);
    await next(page);
    await page.getByRole("button", { name: "封存資料，閱讀節目規則" }).click();
    await home(page);
    await open(page, "备忘录");
    await page.getByRole("button", { name: /錄製須知｜請先閱讀/ }).click();
    await expect(page.locator(".device-banner strong")).toHaveText("X");
    await page.locator(".device-banner").click();
    await expect(page.locator(".post-detail-body")).not.toContainText("金俊抒");
    await kkt(page);
    await expect(
      page.locator("input:not([readonly]):not([type=hidden]), textarea"),
    ).toHaveCount(0);
    await expect(page.locator(".msgs.kk")).not.toContainText("Q2：");
    await page.getByRole("textbox", { name: "KKT消息", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "再想一下" })
      .click();
    await expect(page.locator(".msgs.kk")).not.toContainText("Q2：");
    await option(page);
    await expect(page.locator(".msgs.kk")).toContainText("Q2：");
    await option(page);
    await option(page);
    await option(page, "開始第一天");
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("要幫忙嗎");
    await expect(page.locator(".post-detail-body")).not.toContainText("鯰魚");
    await kkt(page);
    await option(page); // seat
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("橘子");
    await kkt(page);
    await option(page); // introduction
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("主廚");
    await kkt(page);
    await option(page, "主動問旁邊的人需要什麼幫忙");
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("19:10");
    await kkt(page);
    await option(page, 2); // tease at dinner
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("下次也可以");
    await expect(page.locator(".post-detail-body")).toContainText(
      "你是會認真記住別人小事的人",
    );
    await kkt(page);
    await option(page, "我已親自朗讀完這封信");
    await option(page);
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText(
      "你還沒有打開",
    );
    await kkt(page);
    await option(page, "打開箱子");
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("你拆開包裝");
    await expect(page.locator(".post-detail-body")).toContainText("走廊");
    await kkt(page);
    await option(page); // select focus
    await option(page); // select approach
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("你說：");
    await kkt(page);
    await page.getByRole("textbox", { name: "KKT消息", exact: true }).click();
    const choices = await page
      .getByRole("dialog")
      .getByRole("button")
      .allTextContents();
    expect(choices).toHaveLength(6);
    if (late) expect(choices).not.toContain("金俊抒");
    await page.getByRole("dialog").getByRole("button").first().click();
    await option(page);
    await expect(page.locator(".msgs.kk")).toContainText(
      "所有已入住嘉賓都已發送",
    );
    await expect(page.locator(".msgs.kk")).not.toContainText(
      "你的 X 選擇了你。",
    );
    await page
      .locator(".kzbub")
      .filter({ hasText: "所有已入住嘉賓都已發送" })
      .click();
    await page
      .locator(".kzbub")
      .filter({ hasText: /你的 X (選擇了你|沒有選擇你)/ })
      .click();
    await option(page);
    const last = await option(page);
    await expect(page.locator(".msgs.kk")).toContainText(
      "準備好後才進入新的一天",
    );
    await page.waitForTimeout(700);
    await page.reload();
    await page.getByRole("button", { name: "轻触解锁" }).click();
    await pin(page);
    await open(page, "KakaoTalk");
    await expect(page.locator(".msgs.kk")).toContainText(last);
    await page.screenshot({ path: `outputs/season/choice-day1-${late}.png` });
    expect(errors).toEqual([]);
  });

function snapshotBefore(target: string): Runtime {
  const raw = JSON.parse(readFileSync("stories/template/story.json", "utf8"));
  const { work } = compileStory(raw);
  const config = work.data.notes.map(profileConfig).find(Boolean)!;
  const p = saveProfile(
    {
      name: "小雨",
      men: config.men.slice(0, 6),
      ex: config.men[0],
      late: false,
      reason: config.reasons[0],
      reunion: 50,
      mbti: "INFP",
    },
    config,
    () => 0.5,
  );
  let state = dispatch(work, initialRuntime(work), "start");
  state.ui = { notes: { profile: JSON.stringify(p) } };
  for (const step of raw.tests[0].steps) {
    if (step.target === target || step.target === "ui:kakao:answer:" + target)
      break;
    if (
      step.event === "variable" &&
      step.target.startsWith("ui:kakao:answer:")
    ) {
      const id = step.target.slice("ui:kakao:answer:".length);
      const item = renderStoryItem(
        work.data.kakao.find((i) => i.id === id)!,
        seasonValues(work, state, p, config),
      );
      const value =
        item.meta.form === "select"
          ? JSON.parse(item.meta.options)[0]
          : item.meta.form === "sms"
            ? "今天謝謝你。晚安。"
            : "我先把自己的需要說清楚，對方也願意回答，我們一起完成了正式任務並記下具體的過程。";
      const packed = packSeasonAnswer(work, state, id, value);
      if (!packed) throw Error("Invalid replay input: " + id);
      state = dispatch(
        work,
        {
          ...state,
          ui: {
            ...state.ui,
            kakao: { ...state.ui?.kakao, ["answer:" + id]: packed },
          },
        },
        "variable",
        step.target,
      );
    } else if (step.choose) state = choose(work, state, step.choose);
    else if (step.event) state = dispatch(work, state, step.event, step.target);
  }
  return state;
}
async function restore(page: Page, state: Runtime) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "轻触解锁" })).toBeVisible();
  await page.evaluate(async (saved) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("foundphone-studio");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction("saves", "readwrite");
        tx.objectStore("saves").put({ id: saved.workId, state: saved });
        tx.oncomplete = () => {
          database.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, state);
  await page.reload();
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await pin(page);
}

test("date-two temporary chat hides identity and closes before departure", async ({
  page,
}) => {
  await restore(page, snapshotBefore("d2-matched"));
  await open(page, "X");
  await expect(page.locator(".post-detail-body")).toContainText(
    "限時匿名聊天室",
  );
  await kkt(page);
  await expect(page.locator(".kzname")).toHaveText("你的約會對象的 X");
  await expect(page.locator(".kzmav")).toHaveCount(0);
  await option(page);
  await page
    .locator(".kzbub")
    .filter({ hasText: "你的約會對象的 X：" })
    .click();
  await option(page);
  await x(page);
  await expect(page.locator(".post-detail-body")).toContainText(
    "聊天室在出發前關閉",
  );
  await kkt(page);
  await expect(page.locator(".kzname")).toHaveText("換乘戀愛節目組");
  await expect(page.locator(".msgs.kk")).not.toContainText(
    "你的約會對象的 X：",
  );
});

test("day-fourteen relations are shown only after arrival and explicit viewing confirmation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await restore(page, snapshotBefore("d14-watch"));
  await open(page, "备忘录");
  await expect(page.locator(".notes-list")).not.toContainText("第十四天");
  await kkt(page);
  await action(page, "全員已抵達", "開始觀看公開影片");
  await x(page);
  await expect(page.locator(".post-detail-body")).toContainText(
    "小雨 與 金俊抒 曾交往",
  );
  await home(page);
  await open(page, "备忘录");
  await expect(page.locator(".notes-list")).toContainText("第十四天");
});

test("final choice and completion also start from the KKT message field", async ({
  page,
}) => {
  await restore(page, snapshotBefore("final-choice"));
  await open(page, "KakaoTalk");
  await page.getByRole("textbox", { name: "KKT消息", exact: true }).click();
  await page
    .locator(".story-overlay")
    .getByRole("button", { name: "我選擇先保持單身", exact: true })
    .click();
  await x(page);
  await expect(page.locator(".post-detail-body")).toContainText("你選擇先單身");
  await kkt(page);
  await option(page, "確認結束這次旅程");
  await expect(page.locator(".story-overlay")).toContainText("保留自己");
});
