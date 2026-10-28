import { it, expect } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime } from "../schema";
import { profileConfig, saveProfile, renderStoryItem } from "./profile";
import { exScene } from "./exScenes";
import { relationships } from "./relationships";
import { seasonValues, packSeasonAnswer } from "./season";
import story from "../../stories/template/story.json";
const { work } = compileStory(story);
const config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(reason = 0, late = false) {
  const p = saveProfile(
    {
      name: "小雨",
      men: config.men.slice(0, 6),
      ex: config.men[0],
      reason: config.reasons[reason],
      reunion: 50,
      mbti: "INFP",
      late,
    },
    config,
    () => 0.5,
  );
  const state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  return { p, state };
}
it("has six distinct reunions, gifts, letters and early/middle/late conversations", () => {
  const meetings = new Set(),
    gifts = new Set(),
    letters = new Set(),
    conversations = new Set();
  for (let reason = 0; reason < 6; reason++) {
    const { p, state } = setup(reason);
    const values = seasonValues(work, state, p, config);
    meetings.add(values.preMeeting);
    gifts.add(values.giftMemory);
    letters.add(values.letter);
    expect(values.letter.length).toBeGreaterThanOrEqual(200);
    for (const day of [1, 8, 15]) {
      const scene = exScene(work, p, config, day)!;
      expect(scene.options).toHaveLength(3);
      expect(scene.replies).toHaveLength(3);
      conversations.add(scene.opening);
    }
  }
  expect([meetings.size, gifts.size, letters.size, conversations.size]).toEqual(
    [6, 6, 6, 18],
  );
});
it("plays background-specific dialogue instead of a stranger introduction and saves its effect", () => {
  for (let reason = 0; reason < 6; reason++) {
    const { p, state } = setup(reason);
    state.unlocked.push("d1-approach");
    state.ui!.kakao!["answer:d1-focus"] = JSON.stringify({ value: p.ex });
    const before = relationships(work, state, p, config)[p.ex];
    const item = work.data.kakao.find((i) => i.id === "d1-approach")!;
    const offered = JSON.parse(
      renderStoryItem(item, seasonValues(work, state, p, config)).meta.options,
    );
    expect(offered).toEqual(exScene(work, p, config, 1)!.options);
    const packed = packSeasonAnswer(work, state, item.id, offered[0]);
    expect(packed).toBeDefined();
    state.ui!.kakao!["answer:d1-approach"] = packed!;
    const values = seasonValues(work, state, p, config),
      after = relationships(work, state, p, config)[p.ex];
    expect(values.interaction1).toContain(
      exScene(work, p, config, 1)!.replies[0],
    );
    expect(values.interaction1).not.toContain("還不熟悉彼此");
    expect(after.trust).toBe(before.trust + 3);
    expect(after.meetings).toBe(1);
    expect(values.discussion1).not.toContain(offered[0]);
    expect(values.discussion1).not.toContain(
      exScene(work, p, config, 1)!.replies[0],
    );
  }
});
it("keeps the old recorded choices effective and preserves a pending day-two entry", () => {
  const { p, state } = setup();
  const item = work.data.kakao.find((i) => i.id === "d1-approach")!;
  state.ui!.kakao!["answer:d1-focus"] = JSON.stringify({ value: p.ex });
  state.ui!.kakao!["answer:d1-approach"] = JSON.stringify({
    value: JSON.parse(item.meta.legacyOptions)[0],
  });
  expect(relationships(work, state, p, config)[p.ex].meetings).toBe(1);
  expect(
    packSeasonAnswer(work, state, "d1-next", "進入第 2 天"),
  ).toBeUndefined();
  state.unlocked.push("d1-next");
  expect(packSeasonAnswer(work, state, "d1-next", "進入第 2 天")).toBeDefined();
  expect(
    work.data.kakao.find((i) => i.id === "d1-next")!.meta.composerLabel,
  ).toContain("進入第 2 天");
});
it("does not place an absent X in the first-night dinner scene", () => {
  for (let reason = 0; reason < 6; reason++) {
    const { p, state } = setup(reason, true);
    const values = seasonValues(work, state, p, config);
    expect(values.xAtDinner).not.toContain(p.ex);
    expect(values.xAtDinner).not.toContain("他看見你");
    expect(values.xAtDinner.length).toBeGreaterThan(45);
  }
});
