import { describe, expect, it } from "vitest";
import {
  castFor,
  saveProfile,
  parseProfile,
  groupEpisodeItems,
  renderStoryItem,
  profileConfig,
} from "./profile";
import { compileStory } from "../story-engine/compiler";
import story from "../../stories/template/story.json";
const { work } = compileStory(story);
const config = work.data.notes.map(profileConfig).find(Boolean)!;
describe("private participant setup", () => {
  it("preserves unfinished drafts and rejects unfinished submissions", () => {
    const p = {
      name: "",
      men: [],
      ex: "",
      late: false,
      reason: config.reasons[0],
      reunion: 50,
    };
    expect(parseProfile(JSON.stringify(p), true)).toEqual(p);
    expect(parseProfile(JSON.stringify(p))).toBeNull();
    expect(parseProfile("<script>")).toBeNull();
  });
  for (const late of [false, true]) {
    it(`saves a stable cast when later entry is ${late}`, () => {
      for (let m = 0; m < 5; m++)
        for (let f = 0; f < 5; f++) {
          const draws = late ? [f / 5, 0.25] : [m / 5, f / 5, 0.25];
          const p = saveProfile(
            {
              name: "小雨",
              men: config.men.slice(0, 6),
              ex: config.men[0],
              late,
              reason: config.reasons[0],
              reunion: 50,
            },
            config,
            () => draws.shift()!,
          );
          const cast = castFor(p, config);
          expect(castFor(parseProfile(JSON.stringify(p))!, config)).toEqual(
            cast,
          );
          expect(cast.presentMen).toHaveLength(5);
          expect(cast.presentWomen).toHaveLength(4);
          expect(cast.male === p.ex).toBe(late);
          expect(cast.presentWomen).not.toContain(cast.female);
        }
    });
  }
  it("does not treat authored text or answers as executable markup", () => {
    const item = work.data.notes.find((i) => i.id === "setup")!;
    expect(
      renderStoryItem(
        { ...item, body: "{{player}}" },
        { player: "<script>alert(1)</script>" },
      ).richText,
    ).toBe("");
  });
  it("groups episode fragments without changing ordinary notes", () => {
    const base = work.data.notes[0];
    const items = groupEpisodeItems([
      {
        ...base,
        id: "base",
        body: "A",
        meta: { episode: "1", episodeRoot: "true" },
      },
      {
        ...base,
        id: "part",
        body: "B",
        meta: { episode: "1", episodePart: "true" },
      },
      { ...base, id: "plain", body: "C" },
    ]);
    expect(items.map((i) => i.id)).toEqual(["base", "plain"]);
    expect(items[0].body).toContain("B");
    expect(items[1].body).toBe("C");
  });
});

it("admits Geonwoo as X or another guest while retaining the six-person cast and reveal schedule", async () => {
  const { initialRuntime } = await import("../schema");
  const { seasonValues, packSeasonAnswer } = await import("./season");
  const index = config.men.indexOf("張家豪");
  expect(config.men[index + 1]).toBe("金虔佑");
  for (const late of [false, true]) {
    const p = saveProfile(
      {
        name: "小雨",
        men: [
          "金虔佑",
          ...config.men.filter((n) => n !== "金虔佑").slice(0, 5),
        ],
        ex: "金虔佑",
        late,
        reason: config.reasons[0],
        reunion: 50,
      },
      config,
      () => 0.5,
    );
    const state = initialRuntime(work);
    state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
    const values = seasonValues(work, state, p, config);
    expect(JSON.parse(values.menOptions1)).toHaveLength(5);
    expect(JSON.parse(values.menOptions10)).toHaveLength(6);
    expect(JSON.parse(values.menOptions1).includes(p.ex)).toBe(!late);
    expect(values.publicRoster1).not.toMatch(/23|舞蹈|2003|韓國/);
    expect(values.publicRoster7.includes("金虔佑｜ESTJ｜23 歲｜舞蹈表演者")).toBe(
      !late,
    );
    state.ui.kakao!["answer:d10-focus"] = JSON.stringify({ value: p.ex });
    state.unlocked.push("d10-approach");
    const options = JSON.parse(
      seasonValues(work, state, p, config).conversationOptions10,
    );
    expect(
      JSON.parse(packSeasonAnswer(work, state, "d10-approach", options[0])!)
        .exBranch,
    ).toBe(true);
    expect(values.firstDinnerEncounters).not.toMatch(/undefined|\{\{/);
  }
});
it("preserves existing cast identities after inserting a candidate and gives the newcomer his own scene", async () => {
  const { initialRuntime } = await import("../schema");
  const { seasonValues } = await import("./season");
  const p = saveProfile(
    {
      name: "小雨",
      men: ["金俊抒", "張家豪", "金虔佑", "李理悟", "周安信", "鄭相炫"],
      ex: "金俊抒",
      late: true,
      reason: config.reasons[0],
      reunion: 50,
    },
    config,
    () => 0.5,
  );
  const state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  for (const [focus, expected] of [
    ["金虔佑", "不像開會"],
    ["李理悟", "姓名牌"],
    ["鄭相炫", "廚房哪扇櫃子"],
  ]) {
    state.ui.kakao!["answer:d1-focus"] = JSON.stringify({ value: focus });
    state.ui.kakao!["answer:d1-approach"] = JSON.stringify({
      value: "輕鬆聊聊",
      optionIndex: 0,
    });
    expect(seasonValues(work, state, p, config).interaction1).toContain(
      expected,
    );
  }
  const former = {
    ...p,
    men: config.men.filter((n) => n !== "金虔佑").slice(0, 6),
  };
  state.ui.notes!.profile = JSON.stringify(former);
  expect(parseProfile(state.ui.notes!.profile)?.men).toEqual(former.men);
  expect(seasonValues(work, state, former, config).men10).not.toContain(
    "金虔佑",
  );
});
