import { it, expect } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime } from "../schema";
import { saveProfile, profileConfig, renderStoryItem } from "./profile";
import {
  finalConsent,
  relationships,
  repairOptions,
  selected,
} from "./relationships";
import { residentCast, packSeasonAnswer, seasonValues } from "./season";
import story from "../../stories/template/story.json";
const { work } = compileStory(story);
const config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(late = false, reason = 0) {
  const p = saveProfile(
    {
      name: "小雨",
      men: config.men.slice(0, 6),
      ex: config.men[0],
      late,
      reason: config.reasons[reason],
      reunion: 50,
      mbti: "INFP",
    },
    config,
    () => 0.5,
  );
  const state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  return { p, state };
}
function put(state: Runtime, id: string, value: string) {
  state.ui!.kakao!["answer:" + id] = JSON.stringify({ value });
}
function route(target: string, late = false, reason = 0, pressure = false) {
  const { p, state } = setup(late, reason);
  for (let d = 1; d <= 21; d++) {
    if (!residentCast(p, config, d).men.includes(target)) continue;
    put(state, `d${d}-focus`, target);
    put(
      state,
      `d${d}-approach`,
      JSON.parse(
        work.data.kakao.find((i) => i.id === `d${d}-approach`)!.meta.options,
      )[pressure ? 1 : 0],
    );
    put(state, `d${d}-recipient`, target);
    put(state, `d${d}-sms`, "今天辛苦了。");
  }
  for (const d of [7, 14, 19])
    put(state, `d${d}-repair`, repairOptions(work, p, config)[0]);
  put(state, "d21-chat1", repairOptions(work, p, config)[0]);
  put(state, "d21-chat2", "我願意重新交往，但要把剛才談的改變放進生活裡。");
  return { p, state };
}
it("has only authored choices, rejects arbitrary injected answers, and never falls back to free text", () => {
  const { p, state } = setup();
  for (const i of work.data.kakao.filter((i) => i.meta.form)) {
    expect(i.meta.form, i.id).toBe("select");
    const rendered = renderStoryItem(i, seasonValues(work, state, p, config));
    const opts = JSON.parse(rendered.meta.options);
    expect(opts.length, i.id).toBeGreaterThan(0);
    expect(new Set(opts).size).toBe(opts.length);
    expect(opts.join("")).not.toContain("{{");
    state.unlocked.push(i.id);
    expect(
      packSeasonAnswer(work, state, i.id, "我任意輸入一段沒有提供的答案"),
    ).toBeUndefined();
  }
});
it("can earn reunion for every background, including the later-entry X", () => {
  for (let reason = 0; reason < 6; reason++)
    for (const late of [false, true]) {
      const { p: initial } = setup(late, reason);
      const { p, state } = route(initial.ex, late, reason);
      expect(
        finalConsent(work, state, p, config, p.ex),
        `${reason}/${late}`,
      ).toMatchObject({ success: true });
      const snapshot = JSON.parse(JSON.stringify(state));
      expect(relationships(work, snapshot, p, config)).toEqual(
        relationships(work, state, p, config),
      );
    }
});
it("requires repair and an actual renewed commitment, not just memories or initial reunion percent", () => {
  const { p, state } = route(config.men[0]);
  for (const d of [7, 14, 19])
    put(state, `d${d}-repair`, repairOptions(work, p, config)[1]);
  put(state, "d21-chat1", repairOptions(work, p, config)[1]);
  expect(
    finalConsent(work, state, { ...p, reunion: 100 }, config, p.ex).success,
  ).toBe(false);
  const clean = route(p.ex);
  put(clean.state, "d21-chat2", "我想好好道別，節目結束後先不要保持私下聯絡。");
  expect(finalConsent(work, clean.state, clean.p, config, p.ex).success).toBe(
    false,
  );
});
it("can earn a new relationship, while switching only at the final scene fails", () => {
  const target = config.men[1];
  const { p, state } = route(target);
  expect(finalConsent(work, state, p, config, target).success).toBe(true);
  expect(finalConsent(work, state, p, config, p.men[2]).success).toBe(false);
  const { state: empty } = setup();
  expect(finalConsent(work, empty, p, config, target).success).toBe(false);
});
it("repeated pressure can lose both routes even with the same target and many messages", () => {
  for (const target of config.men.slice(0, 2)) {
    const { p, state } = route(target, false, 0, true);
    expect(finalConsent(work, state, p, config, target).success).toBe(false);
  }
});
it("never awards points for rerendering and does not rewrite a past day's relationship history", () => {
  const { p, state } = route(config.men[1]);
  const before = relationships(work, state, p, config, 1);
  const values = seasonValues(work, state, p, config);
  put(state, "d21-focus", p.men[2]);
  expect(relationships(work, state, p, config, 1)).toEqual(before);
  expect(seasonValues(work, state, p, config).interaction1).toBe(
    values.interaction1,
  );
  expect(relationships(work, state, p, config)).toEqual(
    relationships(work, state, p, config),
  );
  expect(selected(state, "d21-focus")).toBe(p.men[2]);
});

it("stores a conversation's reaction before a later same-day repair decision", () => {
  const { p, state } = setup();
  const approach = work.data.kakao.find((i) => i.id === "d7-approach")!;
  const opts = JSON.parse(approach.meta.options);
  for (const d of [1, 2]) {
    put(state, `d${d}-focus`, p.ex);
    put(state, `d${d}-approach`, opts[1]);
  }
  put(state, "d7-focus", p.ex);
  state.unlocked.push("d7-approach");
  const packed = packSeasonAnswer(work, state, "d7-approach", opts[0]);
  expect(packed).toBeDefined();
  state.ui!.kakao!["answer:d7-approach"] = packed!;
  const before = seasonValues(work, state, p, config).interaction7;
  put(state, "d7-repair", repairOptions(work, p, config)[1]);
  expect(
    relationships(work, state, p, config, 7)[p.ex].pressure,
  ).toBeGreaterThan(10);
  expect(seasonValues(work, state, p, config).interaction7).toBe(before);
});
