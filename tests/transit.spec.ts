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
import { momentFor, packMoment } from "../src/story-forms/encounters";
import { parseProfile } from "../src/story-forms/profile";
import { test, expect, type Page } from "@playwright/test";
import { scriptConverter } from "../src/story-forms/ChineseScript";
async function pin(page: Page) {
  for (const n of "0112")
    await page.getByRole("button", { name: "密码键" + n, exact: true }).click();
}
async function open(page: Page, name: string) {
  await expect(page.locator(".home-pages")).toBeVisible();
  const icon = page.getByRole("button", { name: "打开" + name, exact: true });
  if (await icon.isVisible()) await icon.click();
  else {
    await page.locator(".home-search").click();
    await page
      .locator(".system-panel")
      .getByRole("button", {
        name: scriptConverter(
          (await page.locator(".phone-shell").getAttribute("lang")) ===
            "zh-Hant"
            ? "traditional"
            : "simplified",
        )(name),
        exact: true,
      })
      .click();
  }
}
async function home(page: Page) {
  await page.getByRole("button", { name: "返回桌面", exact: true }).click();
  await expect(page.locator(".home-pages")).toBeVisible();
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
  const field = page.getByRole("button", { name: "KKT消息", exact: true });
  await expect(field).toHaveAttribute("aria-haspopup", "dialog");
  const scale = await page.evaluate(() => window.visualViewport?.scale || 1);
  await field.click();
  const dialog = page.getByRole("dialog", { name: "回答選項" });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.visualViewport?.scale || 1)).toBe(
    scale,
  );
  await expect(page.locator(".kzinp input")).toHaveCount(0);
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
    await page
      .getByRole("button", { name: /01｜入住前的[秘祕]密備忘錄/ })
      .click();
    await page.getByRole("button", { name: "繁體中文", exact: true }).click();
    await page
      .getByRole("textbox", { name: "你的姓名", exact: true })
      .fill("小雨");
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
    await page.getByRole("button", { name: "KKT消息", exact: true }).click();
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
    await option(page, "「要幫忙嗎？這個我來洗。」");
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
    await expect(page.locator(".post-detail-body")).not.toContainText(
      "你想把這段時間留給誰",
    );
    await kkt(page);
    const move = await option(page); // choose a concrete house action
    expect([
      "金俊抒",
      "張家豪",
      "金虔佑",
      "李理悟",
      "李相沅",
      "賀鑫隆",
      "周安信",
      "鄭相炫",
    ]).not.toContain(move);
    await option(page); // follow the event instead of choosing a conversation style
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("你說：");
    await kkt(page);
    await page.getByRole("button", { name: "KKT消息", exact: true }).click();
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
    await expect(page.locator(".msgs.kk")).toContainText("匿名訊息 1");
    await expect(page.locator(".msgs.kk")).not.toContainText(
      "沒有嘉賓選擇您。",
    );
    await expect(page.locator(".msgs.kk")).not.toContainText(
      "你的 X 選擇了你。",
    );
    const continueField = page.getByRole("button", {
      name: "KKT消息",
      exact: true,
    });
    await expect(continueField).toContainText("讀完收件，查看 X 提示");
    await continueField.click();
    await expect(continueField).toContainText("繼續後期訪問");
    await continueField.click();
    await option(page);
    const last = await option(page);
    await expect(page.locator(".msgs.kk")).toContainText("第一天已完成");
    await page.waitForTimeout(700);
    await page.reload();
    await page.getByRole("button", { name: "轻触解锁" }).click();
    await pin(page);
    await open(page, "KakaoTalk");
    await expect(page.locator(".msgs.kk")).toContainText(last);
    await expect(
      page.getByRole("button", { name: "KKT消息", exact: true }),
    ).toContainText("進入第 2 天");
    await option(page, "進入第 2 天");
    await x(page);
    await expect(page.locator(".post-detail-body")).toContainText("第 2 天");
    await kkt(page);
    await expect(page.locator(".msgs.kk")).toContainText("第一次約會");
    await page.screenshot({ path: `outputs/season/day2-entry-${late}.png` });
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
  await page.getByRole("button", { name: "KKT消息", exact: true }).click();
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

test("official X posts have audience-scale counters in detail and feed, with per-cut comments", async ({
  page,
}) => {
  await restore(page, snapshotBefore("d1-intro"));
  await open(page, "X");
  const likes = page.getByRole("button", { name: "喜欢帖子", exact: true });
  const label = await likes.innerText();
  expect(
    parseFloat(label) * (label.endsWith("w") ? 10000 : 1),
  ).toBeGreaterThanOrEqual(42000);
  expect(
    Number(
      await page
        .getByRole("button", { name: "查看转发", exact: true })
        .innerText(),
    ),
  ).toBeGreaterThanOrEqual(8600);
  await expect(page.locator(".post-detail-comment")).toHaveCount(8);
  await expect(page.locator(".post-detail-comments")).toContainText("行李輪子");
  await likes.click();
  await expect(likes).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "返回帖子列表", exact: true }).click();
  const raw = JSON.parse(readFileSync("stories/template/story.json", "utf8"));
  const post = raw.content.twitter.find(
    (i: { id: string }) => i.id === "d1-intro",
  );
  const repost = page.getByRole("button", {
    name: "转发" + post.title,
    exact: true,
  });
  await expect(repost).toHaveText(String(post.meta.reposts));
  await repost.click();
  await expect(repost).toHaveText(String(Number(post.meta.reposts) + 1));
  await page.screenshot({ path: "outputs/season/official-x-counters.png" });
});
test("theqoo remains one episode thread with banter, replies and an actual receipt reaction", async ({
  page,
}) => {
  await restore(page, snapshotBefore("d1-i2"));
  await open(page, "浏览器");
  await page.getByRole("button", { name: /EP\.1｜十個人面試/ }).click();
  const reader = page.locator(".native-reader");
  await expect(reader).toContainText("目前全員待複試");
  await expect(reader).toContainText("62樓");
  await expect(reader).toContainText("收到");
  await expect(reader).toContainText(">>");
  await expect(reader).not.toContainText("匿名觀眾01");
  await expect(reader).not.toContainText(
    "先把這一集的公開片段看完，不用急著站隊",
  );
  await page.screenshot({ path: "outputs/season/theqoo-episode1.png" });
});

test("unreleased personal footage has no audience actions or replies and uses readable X type", async ({
  page,
}) => {
  await restore(page, snapshotBefore("d0-meeting"));
  await open(page, "X");
  await expect(
    page.locator(".app-post-detail .x-private-record"),
  ).toContainText("僅玩家可見");
  await expect(page.locator(".post-detail-comment")).toHaveCount(0);
  await expect(page.locator(".post-detail-actions")).toHaveCount(0);
  await expect(page.locator(".post-detail-reply")).toHaveCount(0);
  expect(
    await page
      .locator(".post-detail-body")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(21);
  await page.getByRole("button", { name: "返回帖子列表", exact: true }).click();
  expect(
    await page
      .locator(".kzxx")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);
});

test("a date has two decisions with visible consequences before its existing reflection", async ({
  page,
}) => {
  const state = snapshotBefore("d2-date-scene");
  const raw = JSON.parse(readFileSync("stories/template/story.json", "utf8"));
  const { work } = compileStory(raw),
    config = work.data.notes.map(profileConfig).find(Boolean)!,
    p = parseProfile(state.ui?.notes?.profile)!;
  const before = seasonValues(work, state, p, config);
  await restore(page, state);
  await open(page, "X");
  await expect(page.locator(".post-detail-body")).toContainText(
    before.dateOpening2,
  );
  await kkt(page);
  const first = await option(page, 0);
  state.unlocked.push("d2-date-choice-a");
  state.ui!.kakao!["answer:d2-date-choice-a"] = packSeasonAnswer(
    work,
    state,
    "d2-date-choice-a",
    first,
  )!;
  const after = seasonValues(work, state, p, config);
  await x(page);
  await expect(page.locator(".post-detail-body")).toContainText(
    after.dateReply2a,
  );
  await expect(page.locator(".post-detail-body")).toContainText(
    after.dateMiddle2,
  );
  await kkt(page);
  const second = await option(page, 1);
  state.unlocked.push("d2-date-choice-b");
  state.ui!.kakao!["answer:d2-date-choice-b"] = packSeasonAnswer(
    work,
    state,
    "d2-date-choice-b",
    second,
  )!;
  await x(page);
  await expect(page.locator(".post-detail-body")).toContainText(
    seasonValues(work, state, p, config).dateReply2b,
  );
  await kkt(page);
  await page.getByRole("button", { name: "KKT消息", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "回答選項" })).toContainText(
    "沒完全投入",
  );
});

test("opening soundtrack continues across apps and Music controls pause without a duplicate player", async ({
  page,
}) => {
  await page.goto("/");
  const audio = page.locator("audio[data-opening-music]");
  await expect(audio).toHaveCount(1);
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await pin(page);
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).paused))
    .toBe(false);
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).currentTime))
    .toBeGreaterThan(0);
  await open(page, "音乐");
  await expect(page.locator(".native-now-playing")).toContainText(
    "SUN OR SUCK",
  );
  await expect(page.locator("audio")).toHaveCount(1);
  await page.getByRole("button", { name: "暫停開屏音樂", exact: true }).click();
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).paused))
    .toBe(true);
  await home(page);
  await open(page, "X");
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).paused))
    .toBe(true);
  await home(page);
  await open(page, "音乐");
  await page.getByRole("button", { name: "播放開屏音樂", exact: true }).click();
  await expect(audio).not.toHaveAttribute("loop");
  await audio.evaluate((el) => {
    const a = el as HTMLAudioElement;
    a.currentTime = a.duration - 0.15;
  });
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).ended))
    .toBe(true);
  await home(page);
  await open(page, "X");
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).paused))
    .toBe(true);
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).ended))
    .toBe(true);
});

for (const script of ["traditional", "simplified"] as const)
  test(`language is selected before the name and survives setup, KKT answers and refresh: ${script}`, async ({
    page,
  }) => {
    const t = scriptConverter(script);
    await page.goto("/");
    await page.getByRole("button", { name: "轻触解锁" }).click();
    await pin(page);
    await expect(
      page
        .locator(".home-pages")
        .getByRole("button", { name: "打开X", exact: true }),
    ).toBeInViewport();
    await expect(
      page
        .locator(".home-pages")
        .getByRole("button", { name: "打开KakaoTalk", exact: true }),
    ).toBeInViewport();
    await open(page, "备忘录");
    await page
      .getByRole("button", { name: /01｜入住前的[秘祕]密備忘錄/ })
      .click();
    await expect(
      page.getByRole("textbox", { name: "你的姓名", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: script === "traditional" ? "繁體中文" : "简体中文",
        exact: true,
      })
      .click();
    await page
      .getByRole("textbox", { name: "你的姓名", exact: true })
      .fill("小雨");
    const nextQuestion = () =>
      page.getByRole("button", { name: t("下一題"), exact: true }).click();
    await nextQuestion();
    for (const name of [
      "金俊抒",
      "張家豪",
      "金虔佑",
      "李理悟",
      "李相沅",
      "賀鑫隆",
    ])
      await page.getByRole("checkbox", { name: t(name), exact: true }).check();
    await nextQuestion();
    await page.getByLabel("前任 X", { exact: true }).selectOption("張家豪");
    await nextQuestion();
    await nextQuestion();
    await nextQuestion();
    await nextQuestion();
    await page
      .getByRole("button", { name: t("封存資料，閱讀節目規則"), exact: true })
      .click();
    await home(page);
    await open(page, "备忘录");
    await page
      .getByRole("button", { name: new RegExp(t("錄製須知｜請先閱讀")) })
      .click();
    await page.locator(".device-banner").click();
    await expect(page.locator(".post-detail-body")).toContainText(
      t("事前見面"),
    );
    await kkt(page);
    await page.getByRole("button", { name: "KKT消息", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const shown = await dialog.getByRole("button").first().innerText();
    await dialog.getByRole("button").first().click();
    await expect(page.locator(".msgs.kk")).toContainText(shown);
    await expect(page.locator(".msgs.kk")).toContainText("Q2：");
    await page.waitForTimeout(350);
    await page.reload();
    await page.getByRole("button", { name: "轻触解锁" }).click();
    await pin(page);
    await open(page, "KakaoTalk");
    await expect(page.locator(".phone-shell")).toHaveAttribute(
      "lang",
      script === "simplified" ? "zh-Hans" : "zh-Hant",
    );
    await expect(page.locator(".msgs.kk")).toContainText(shown);
    await expect(page.locator(".msgs.kk")).toContainText("Q2：");
    await page.screenshot({ path: `outputs/season/script-${script}.png` });
  });

test("eight name-only candidates keep the six-person cap and place Geonwoo after Jiahao", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".notice-open").first().click();
  await pin(page);
  await page
    .getByRole("button", { name: /01｜入住前的[秘祕]密備忘錄/ })
    .click();
  await page.getByRole("button", { name: "繁體中文", exact: true }).click();
  await page
    .getByRole("textbox", { name: "你的姓名", exact: true })
    .fill("小雨");
  await next(page);
  const choices = page.getByRole("checkbox");
  await expect(choices).toHaveCount(8);
  const names = await choices.evaluateAll((nodes) =>
    nodes.map((n) => n.parentElement?.textContent?.trim()),
  );
  expect(names[names.indexOf("張家豪") + 1]).toBe("金虔佑");
  await expect(page.locator(".story-profile fieldset img")).toHaveCount(0);
  for (const name of [
    "金俊抒",
    "張家豪",
    "金虔佑",
    "李理悟",
    "周安信",
    "鄭相炫",
  ])
    await page.getByRole("checkbox", { name, exact: true }).check();
  await expect(
    page.getByRole("checkbox", { name: "李相沅", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "賀鑫隆", exact: true }),
  ).toBeDisabled();
  await next(page);
  const ex = page.getByLabel("前任 X", { exact: true });
  await ex.selectOption("金虔佑");
  await expect(ex).toHaveValue("金虔佑");
  await expect(ex.locator("option")).toHaveCount(7);
  await next(page);
  await next(page);
  await next(page);
  await next(page);
  await page.getByRole("button", { name: "封存資料，閱讀節目規則" }).click();
  await expect(page.locator(".story-profile")).toContainText("入住資料已封存");
  await page.reload();
  await page.getByRole("button", { name: "轻触解锁" }).click();
  await pin(page);
  await open(page, "备忘录");
  await page
    .getByRole("button", { name: /01｜入住前的[秘祕]密備忘錄/ })
    .click();
  await expect(page.locator(".story-profile")).toContainText("入住資料已封存");
});

test("a drawn house incident offers physical actions and shows the selected response", async ({
  page,
}) => {
  const raw = JSON.parse(readFileSync("stories/template/story.json", "utf8"));
  const { work } = compileStory(raw),
    config = work.data.notes.map(profileConfig).find(Boolean)!;
  const state = snapshotBefore("d4-afternoon"),
    p = parseProfile(state.ui?.notes?.profile)!;
  let moment = momentFor(work, state, p, config, 4)!;
  await restore(page, state);
  await open(page, "X");
  await expect(page.locator(".post-detail-body")).toContainText(
    moment.scene.title,
  );
  await expect(page.locator(".post-detail-body")).not.toContainText(
    "你想把這段時間留給誰",
  );
  await kkt(page);
  await option(page, moment.options[0]);
  state.ui!.kakao!["answer:d4-focus"] = JSON.stringify(
    packMoment(work, state, p, config, 4, "focus", moment.options[0]),
  );
  moment = momentFor(work, state, p, config, 4)!;
  await expect(page.locator(".msgs.kk")).toContainText(moment.prompt);
  const response = [...moment.choices].sort((a, b) => b.signal - a.signal)[0];
  await option(page, response.line);
  await x(page);
  await expect(page.locator(".post-detail-body")).toContainText(
    response.result,
  );
  await expect(page.locator(".post-detail-body")).not.toContainText(
    "現在方不方便",
  );
  await page.screenshot({ path: "outputs/season/house-incident.png" });
});

test("staying with a female guest gives a complete scene and still reaches the nightly SMS", async ({
  page,
}) => {
  const raw = JSON.parse(readFileSync("stories/template/story.json", "utf8"));
  const { work } = compileStory(raw),
    config = work.data.notes.map(profileConfig).find(Boolean)!;
  const state = snapshotBefore("d5-afternoon"),
    p = parseProfile(state.ui?.notes?.profile)!;
  let moment = momentFor(work, state, p, config, 5)!;
  await restore(page, state);
  await open(page, "X");
  await kkt(page);
  await option(page, moment.options[2]);
  state.ui!.kakao!["answer:d5-focus"] = JSON.stringify(
    packMoment(work, state, p, config, 5, "focus", moment.options[2]),
  );
  moment = momentFor(work, state, p, config, 5)!;
  await expect(page.locator(".msgs.kk")).toContainText(moment.names.woman);
  await option(page, moment.choices[0].line);
  await x(page);
  await expect(page.locator(".post-detail-body")).toContainText(
    moment.choices[0].result,
  );
  await kkt(page);
  await expect(page.locator(".msgs.kk")).toContainText(
    "今晚的心動短信必須發送",
  );
  await page.getByRole("button", { name: "KKT消息", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "回答選項" })).toBeVisible();
  await page.screenshot({ path: "outputs/season/female-house-scene.png" });
});
