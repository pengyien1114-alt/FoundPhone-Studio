import { describe, expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime, type Item } from "../schema";
import { dispatch, choose, visible } from "../engine";
import story from "../../stories/template/story.json";
import {
  profileConfig,
  saveProfile,
  renderStoryItem,
  type Profile,
  castFor,
} from "./profile";
import {
  seasonValues,
  residentCast,
  pairsFor,
  dateMatches,
  answer,
  packSeasonAnswer,
  storedVotes,
  inputError,
} from "./season";
import { notificationContent } from "../SystemNotifications";
const { work } = compileStory(story);
const config = work.data.notes.map(profileConfig).find(Boolean)!;
const allItems = Object.values(work.data).flat();
const get = (id: string) => allItems.find((i) => i.id === id)!;
function start(late = false, seed = "test") {
  const p: Profile = {
    ...saveProfile(
      {
        name: "小雨",
        men: config.men.slice(0, 6),
        ex: config.men[0],
        late,
        reason: config.reasons[0],
        reunion: 50,
        mbti: "INFP",
      },
      config,
      () => 0.5,
    ),
    seed,
  };
  let state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) } };
  state = dispatch(work, state, "start");
  return { p, state };
}
function projected(item: Item, p: Profile, state: Runtime) {
  return renderStoryItem(item, seasonValues(work, state, p, config));
}
function reply(state: Runtime, id: string, value: string): Runtime {
  const packed = packSeasonAnswer(work, state, id, value);
  expect(packed, id + " accepts answer").toBeDefined();
  return dispatch(
    work,
    {
      ...state,
      ui: {
        ...state.ui,
        kakao: { ...state.ui?.kakao, ["answer:" + id]: packed! },
      },
    },
    "variable",
    "ui:kakao:answer:" + id,
  );
}
function response(id: string, item: Item) {
  if (item.meta.form === "select") return JSON.parse(item.meta.options)[0];
  if (id.endsWith("-sms")) return "今天謝謝你聽我說話。晚安。";
  if (id === "d3-task")
    return "我先確認對方願意參與，再照任務內容作了示範，對方回應後我們一起把正式任務完成。";
  return "我想先把自己的需要說清楚，也願意留時間聽對方回答，不急著替今天的感受下結論。";
}
for (const late of [false, true])
  for (const route of ["reunion", "new", "single"]) {
    it(`plays every mandatory day, question and reveal: ${route}, late=${late}`, () => {
      const { p, state: initial } = start(late, route);
      let state = initial;
      const path = story.tests.find((t) => t.name.endsWith(route))!;
      let revealRead = false,
        basicRead = false;
      for (const step of path.steps) {
        const pending = work.data.kakao.filter(
          (i) =>
            visible(i, state) &&
            i.meta.form &&
            !state.completed.includes("submit-" + i.id),
        );
        expect(
          pending.length,
          "at most one unanswered input",
        ).toBeLessThanOrEqual(1);
        if (
          step.event === "variable" &&
          step.target.startsWith("ui:kakao:answer:")
        ) {
          const id = step.target.slice("ui:kakao:answer:".length),
            item = projected(get(id), p, state);
          expect(visible(get(id), state), id + " is available").toBe(true);
          if (id.endsWith("-sms")) {
            const d = Number(id.match(/^d(\d+)/)![1]);
            expect(storedVotes(state, d)).toBeUndefined();
            expect(state.unlocked).not.toContain(`d${d}-hint`);
          }
          const offered = JSON.parse(item.meta.options || "[]") as string[];
          const target =
            route === "new"
              ? castFor(p, config).presentMen.find((m) => m !== p.ex)!
              : p.ex;
          const value =
            (id.endsWith("-focus") ||
              id.endsWith("-recipient") ||
              id === "final-new-target") &&
            offered.includes(target)
              ? target
              : response(id, item);
          state = reply(state, id, value);
        } else if (step.choose) state = choose(work, state, step.choose);
        else if (step.event) {
          if (step.event === "read")
            expect(
              visible(get(step.target), state),
              step.target + " readable",
            ).toBe(true);
          if (step.target === "d14-reveal") revealRead = true;
          if (step.target === "d7-afternoon") basicRead = true;
          state = dispatch(work, state, step.event, step.target);
        }
        expect(state.unlocked.includes("sealed-roster")).toBe(basicRead);
        expect(state.unlocked.includes("revealed-pairs")).toBe(revealRead);
        if (!state.completed.includes("submit-d14-watch")) {
          const currentValues = seasonValues(work, state, p, config);
          for (const post of work.data.twitter.filter((i) => visible(i, state)))
            expect(renderStoryItem(post, currentValues).body).not.toMatch(
              /與.{1,6}曾交往|的X是|的 X 是/,
            );
        }
      }
      expect(state.endings).toContain(path.ending);
      if (route !== "single")
        expect(seasonValues(work, state, p, config).finalResult).toContain(
          route === "new" ? "換乘成功" : "復合成功",
        );
      expect(answer(state, "d0-q1")).toBe(
        JSON.parse(get("d0-q1").meta.options)[0],
      );
      for (let d = 1; d <= 21; d++) {
        const residents = residentCast(p, config, d),
          votes = storedVotes(state, d)!;
        expect(votes).toHaveLength(d < 3 ? 10 : d < 10 ? 11 : 12);
        expect(new Set(votes.map((v) => v.from)).size).toBe(votes.length);
        for (const v of votes) {
          expect(v.text.trim()).not.toBe("");
          expect(
            residents.men.includes(v.from) ? residents.women : residents.men,
          ).toContain(v.to);
        }
        const values = seasonValues(work, state, p, config);
        const receive = values["sms" + d];
        for (const v of votes.filter((v) => v.to === p.name))
          expect(receive).not.toContain(v.from);
        if (d < 14)
          expect(values["hint" + d]).toMatch(
            /^你的 X (選擇了你|沒有選擇你)。$/,
          );
      }
      const recovered: Runtime = JSON.parse(JSON.stringify(state));
      expect(storedVotes(recovered, 21)).toEqual(storedVotes(state, 21));
      expect(seasonValues(work, recovered, p, config).travelPartner).toBe(
        seasonValues(work, state, p, config).travelPartner,
      );
    }, 20000);
  }
describe("eligibility, privacy and independent choices", () => {
  it("keeps arrivals on day 3 and day 10 and never counts future participants", () => {
    const { p } = start();
    for (let d = 1; d <= 21; d++) {
      const r = residentCast(p, config, d);
      expect(r.men).toHaveLength(d < 10 ? 5 : 6);
      expect(r.women).toHaveLength(d < 3 ? 5 : 6);
    }
  });
  it("cannot send blank, overlong or over-two-sentence messages or answer a locked future question", () => {
    const { p, state: initial } = start();
    let state = initial;
    expect(packSeasonAnswer(work, state, "d1-sms", "你好")).toBeUndefined();
    const item = get("d1-sms");
    expect(inputError(item, " ")).not.toBe("");
    expect(inputError(item, "一。二。三。")).not.toBe("");
    expect(inputError(item, "One. Two. Three.")).not.toBe("");
    state.unlocked.push("d1-sms");
    state.ui!.kakao = {
      "answer:d1-recipient": JSON.stringify({
        value: residentCast(p, config, 1).men[0],
      }),
    };
    expect(
      packSeasonAnswer(work, state, "d1-sms", "一。二。三。"),
    ).toBeUndefined();
    const sms = JSON.parse(projected(item, p, state).meta.options)[0];
    const packed = packSeasonAnswer(work, state, "d1-sms", sms);
    expect(packed).toBeDefined();
    state = reply(state, "d1-sms", sms);
    expect(packSeasonAnswer(work, state, "d1-sms", "改寫")).toBeUndefined();
    expect(
      inputError(
        get("d3-task"),
        "這件任務現在還沒完成，我希望先跳到下一個自由活動。",
      ),
    ).not.toBe("");
  });
  it("matches first-date and assigned-date groups without assigning any woman to her own X", () => {
    for (let i = 0; i < 12; i++) {
      const { p, state } = start(i % 2 === 0, String(i));
      for (const d of [2, 3]) {
        const matches = dateMatches(p, config, state, d),
          pairs = pairsFor(p, config);
        expect(Object.keys(matches)).toHaveLength(5);
        expect(new Set(Object.values(matches)).size).toBe(5);
        for (const [w, m] of Object.entries(matches))
          expect(pairs.find((r) => r.woman === w)?.man).not.toBe(m);
      }
    }
  });
  it("does not use the player's initial wish as the other person's final answer", () => {
    const { p, state } = start();
    state.variables.finalRoute = "reunion";
    state.ui!.kakao = {
      "answer:d21-chat2": JSON.stringify({ value: "先說清楚界線" }),
    };
    expect(
      seasonValues(work, state, { ...p, reunion: 0 }, config).finalResult,
    ).toBe(
      seasonValues(work, state, { ...p, reunion: 100 }, config).finalResult,
    );
  });
  it("uses the destination app icon and route in every production notification", () => {
    const notices = work.nodes
      .flatMap((n) => n.actions)
      .filter((a) => a.type === "notification");
    expect(notices.length).toBeGreaterThan(100);
    for (const a of notices) {
      const n = notificationContent(String(a.value), work.apps);
      expect(["twitter", "notes", "kakao", "safari"]).toContain(n.appId);
      expect(n.appId).not.toBe("messages");
    }
  });
  it("authored basic information and relation mappings are hidden until the scheduled reveal", () => {
    expect(get("sealed-roster").hidden).toBe(true);
    expect(get("revealed-pairs").hidden).toBe(true);
    for (const r of Array.from({ length: 6 }, (_, i) =>
      JSON.parse(get("setup").meta["backstory" + i]),
    )) {
      expect(r.receivedLetter.length).toBeGreaterThanOrEqual(200);
      expect(r.selfLetter.length).toBeGreaterThanOrEqual(200);
    }
    expect(get("d0-meeting").body.length).toBeGreaterThan(300);
    expect(
      work.nodes
        .filter((n) =>
          n.actions.some(
            (a) => a.type === "unlock" && a.key === "sealed-roster",
          ),
        )
        .map((n) => n.id),
    ).toEqual(["read-d7-afternoon"]);
    expect(
      work.nodes
        .filter((n) =>
          n.actions.some(
            (a) => a.type === "unlock" && a.key === "revealed-pairs",
          ),
        )
        .map((n) => n.id),
    ).toEqual(["read-d14-reveal"]);
  });
});

it("keeps travel, mutual-date selection and nightly messages as separate decisions", () => {
  const { p, state } = start(false, "independent");
  state.unlocked.push("d13-sms");
  state.ui!.kakao = {
    "answer:d13-recipient": JSON.stringify({ value: p.men[1] }),
    "answer:d13-travel": JSON.stringify({ value: p.men[2] }),
  };
  const first = JSON.parse(
    packSeasonAnswer(
      work,
      state,
      "d13-sms",
      JSON.parse(projected(get("d13-sms"), p, state).meta.options)[0],
    )!,
  );
  state.ui!.kakao["answer:d13-travel"] = JSON.stringify({ value: p.men[3] });
  const second = JSON.parse(
    packSeasonAnswer(
      work,
      state,
      "d13-sms",
      JSON.parse(projected(get("d13-sms"), p, state).meta.options)[0],
    )!,
  );
  expect(first.votes).toEqual(second.votes);
  expect(second.votes.find((v: { from: string }) => v.from === p.name).to).toBe(
    p.men[1],
  );
});

it("does not assign day-three or day-ten daytime duties to people who arrive that evening", () => {
  const { p, state } = start(false);
  const values = seasonValues(work, state, p, config);
  const delayed = p.maleCatfish!,
    delayedWoman = p.femaleCatfish!;
  expect(values.cook3 + values.wash3).not.toContain(delayedWoman);
  expect(values.cook10 + values.wash10).not.toContain(delayed);
  expect(inputError(get("d2-anon"), "你叫什麼名字，做什麼工作？")).not.toBe("");
});

it("keeps all six private backgrounds unnamed before the public relationship reveal", () => {
  const { p, state } = start();
  for (const [index, reason] of config.reasons.entries()) {
    const person = { ...p, reason };
    const values = seasonValues(work, state, person, config);
    const meeting = renderStoryItem(get("d0-meeting"), values);
    expect(meeting.body.length).toBeGreaterThan(300);
    for (const name of [...config.men, ...config.women])
      expect(meeting.body).not.toContain(name);
    expect(values.letter.length).toBeGreaterThanOrEqual(200);
    if (index === 2) expect(values.revealPairs).toContain("曾結婚，已離婚半年");
    if (index === 4) expect(values.revealPairs).toContain("沒有正式告白");
  }
});
