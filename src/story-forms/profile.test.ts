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
