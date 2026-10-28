import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime } from "../schema";
import story from "../../stories/template/story.json";
import {
  displayStoryItem,
  parseScript,
  scriptConverter,
} from "./ChineseScript";
import { profileConfig, renderStoryItem, saveProfile } from "./profile";
import { packSeasonAnswer, seasonValues } from "./season";

it("converts both scripts with phrase context and preserves an unselected legacy display", () => {
  expect(scriptConverter("simplified")("張家豪的頭髮；皇后在後面。")).toBe(
    "张家豪的头发；皇后在后面。",
  );
  expect(scriptConverter("traditional")("头发发生变化，皇后在后面。")).toBe(
    "頭髮發生變化，皇后在後面。",
  );
  expect(scriptConverter()("简繁混合文字體")).toBe("简繁混合文字體");
  expect(parseScript("unknown")).toBeUndefined();
});
it("keeps canonical choices, cast and relationship effects identical under either display script", () => {
  const { work } = compileStory(story);
  const config = work.data.notes.map(profileConfig).find(Boolean)!;
  const state = initialRuntime(work);
  const p = saveProfile(
    {
      name: "小雨",
      men: config.men.slice(0, 6),
      ex: config.men[1],
      late: false,
      reason: config.reasons[1],
      reunion: 50,
    },
    config,
    () => 0.5,
  );
  state.ui = { notes: { profile: JSON.stringify(p) } };
  const item = renderStoryItem(
    work.data.kakao.find((i) => i.id === "d0-q1")!,
    seasonValues(work, state, p, config),
  );
  const original = JSON.stringify(item);
  state.unlocked.push(item.id);
  const packs = [];
  for (const script of ["traditional", "simplified"] as const) {
    const view = displayStoryItem(item, scriptConverter(script));
    expect(view.meta.options).toBe(item.meta.options);
    expect(view.id).toBe(item.id);
    expect(view.meta.effects).toBe(item.meta.effects);
    const choice = JSON.parse(view.meta.options)[0];
    packs.push(packSeasonAnswer(work, state, item.id, choice));
  }
  expect(packs[0]).toBeDefined();
  expect(packs[0]).toBe(packs[1]);
  expect(JSON.stringify(item)).toBe(original);
});
