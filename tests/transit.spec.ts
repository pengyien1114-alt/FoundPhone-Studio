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
async function text(page: Page, value: string) {
  await page
    .getByRole("textbox", { name: "玩家輸入", exact: true })
    .fill(value);
  await page.getByRole("button", { name: "送出回答", exact: true }).click();
}
async function action(page: Page, question: string, choice: string) {
  await page.locator(".kzbub").filter({ hasText: question }).click();
  await page
    .locator(".story-overlay")
    .getByRole("button", { name: choice, exact: true })
    .click();
}
for (const late of [false, true])
  test(`pre-interview, mandatory letter, gift and nightly collection: late=${late}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    // The lock-screen note notification opens Notes after authentication, not Messages.
    await page.locator(".notice-open").first().click();
    await pin(page);
    await expect(page.locator(".skin-notes")).toBeVisible();
    await page.getByRole("button", { name: /01｜入住前的秘密備忘錄/ }).click();
    await page.getByRole("textbox", { name: "你的姓名" }).fill("小雨");
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
    await expect(page.locator(".story-profile")).not.toContainText("金俊抒");
    await home(page);
    await open(page, "备忘录");
    await expect(page.locator(".notes-list")).not.toContainText("配對");
    await page.getByRole("button", { name: /錄製須知｜請先閱讀/ }).click();
    await expect(page.locator(".native-note-paper")).toContainText(
      "第七天晚餐後公開",
    );
    await expect(page.locator(".device-banner strong")).toHaveText("X");
    await page.locator(".device-banner").click();
    await expect(page.locator(".post-detail-body")).toContainText("事前採訪");
    await expect(page.locator(".post-detail-body")).not.toContainText("金俊抒");
    await kkt(page);
    await expect(page.locator(".msgs.kk")).toContainText("Q1：");
    await expect(page.locator(".msgs.kk")).not.toContainText("Q2：");
    await text(page, "我不確定對方想什麼，先把自己的需要說清楚。");
    await expect(page.locator(".msgs.kk")).toContainText("Q2：");
    await expect(page.locator(".msgs.kk")).not.toContainText("Q3：");
    await text(page, "可能會難受，但我不想替對方決定。");
    await expect(page.locator(".msgs.kk")).toContainText("Q3：");
    await text(page, "我希望這次能更清楚說出需要。");
    await action(page, "今天的事前採訪已保存", "開始第一天");
    await x(page);
    await expect(page.locator(".post-detail-body")).not.toContainText("鯰魚");
    await expect(page.locator(".post-detail-body")).not.toContainText("中期");
    await kkt(page);
    await action(
      page,
      "你想先怎樣參與今晚的備菜",
      "主動問旁邊的人需要什麼幫忙",
    );
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText(
      "你是會認真記住別人小事的人",
    );
    await kkt(page);
    await action(page, "你需要親自念完信", "我已親自朗讀完這封信");
    await text(page, "我想先接受這些話，不急著用它們決定最後的方向。");
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText(
      "你還沒有打開",
    );
    await kkt(page);
    await action(page, "你要現在打開這個箱子嗎", "打開箱子");
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("你拆開包裝");
    await kkt(page);
    const options = await page
      .getByRole("combobox", { name: "選擇回答" })
      .locator("option")
      .allTextContents();
    expect(options).toHaveLength(6);
    if (late) expect(options).not.toContain("金俊抒");
    await page
      .getByRole("combobox", { name: "選擇回答" })
      .selectOption({ index: 1 });
    await page.getByRole("button", { name: "送出回答" }).click();
    await text(page, "第一句。第二句。第三句。");
    await expect(page.getByRole("alert")).toContainText("最多兩句");
    await expect(page.locator(".msgs.kk")).not.toContainText(
      "所有已入住嘉賓都已發送",
    );
    await text(page, "謝謝你今天聽我說話。晚安。");
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
    await expect(page.locator(".msgs.kk")).toContainText(
      /你的 X (選擇了你|沒有選擇你)/,
    );
    await page
      .locator(".kzbub")
      .filter({ hasText: /你的 X (選擇了你|沒有選擇你)/ })
      .click();
    await text(page, "我留意到自己可以說慢一點。");
    await text(page, "明天我想把需要說清楚。");
    await expect(page.locator(".msgs.kk")).toContainText(
      "準備好後才進入新的一天",
    );
    await page.waitForTimeout(700);
    await page.reload();
    await page.getByRole("button", { name: "轻触解锁" }).click();
    await pin(page);
    await open(page, "KakaoTalk");
    await expect(page.locator(".msgs.kk")).toContainText(
      "明天我想把需要說清楚。",
    );
    await page.screenshot({ path: `outputs/season/day1-${late}.png` });
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
  await text(page, "你叫什麼名字，做什麼工作？");
  await expect(page.getByRole("alert")).toContainText("不得詢問");
  await text(page, "我想知道他喜歡什麼樣的行程？");
  await page
    .locator(".kzbub")
    .filter({ hasText: "你的約會對象的 X：" })
    .click();
  await text(page, "謝謝，我會直接問他現在的想法。");
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
