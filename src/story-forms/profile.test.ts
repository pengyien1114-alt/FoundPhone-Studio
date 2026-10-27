import { describe, expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime } from "../schema";
import { choose, dispatch, visible } from "../engine";
import story from "../../stories/template/story.json";
import { parseProfile, renderStoryItem, storyValues } from "./profile";

const { work } = compileStory(story);
const men = [
  "金俊抒",
  "張家豪",
  "李理悟",
  "李相沅",
  "賀鑫隆",
  "周安信",
  "鄭相炫",
];
describe("transit profile and cross-app story", () => {
  it("keeps incomplete drafts but rejects incomplete submissions", () => {
    const p = {
      name: "",
      men: [],
      ex: "",
      late: false,
      reason: "信任破裂",
      reunion: 50,
    };
    expect(parseProfile(JSON.stringify(p), true)).toEqual(p);
    expect(parseProfile(JSON.stringify(p))).toBeNull();
    expect(parseProfile("<script>")).toBeNull();
  });
  for (let omit = 0; omit < 7; omit++) {
    for (const late of [false, true]) {
      it(`keeps cast, X and saves coherent: excluded ${omit}, late ${late}`, () => {
        const selected = men.filter((_, i) => i !== omit);
        for (const ex of selected) {
          let state = initialRuntime(work);
          state.ui = {
            notes: {
              profile: JSON.stringify({
                name: "小雨",
                men: selected,
                ex,
                late,
                reason: "信任破裂",
                reunion: 50,
              }),
            },
          };
          state = dispatch(work, state, "variable", "ui:notes:profile");
          const values = storyValues(work, state);
          expect(values.pairs.split("\n")).toHaveLength(6);
          expect(values.pairs).toContain("小雨 ↔ " + ex);
          expect(values.present.includes(ex)).toBe(!late);
          expect(values.present.split("、")).toHaveLength(late ? 5 : 6);
          expect(values.men).not.toContain(men[omit]);
          state = dispatch(work, state, "read", "dinner-prompt");
          state = choose(work, state, "dinner-new");
          expect(state.unlocked).toContain("x-dinner-new");
          expect(state.unlocked).toContain("q-dinner-new");
          expect(
            visible(
              work.data.twitter.find((i) => i.id === "x-dinner-past")!,
              state,
            ),
          ).toBe(false);
          expect(storyValues(work, state).reunion).toBe("35");
          state = dispatch(work, state, "read", "letter-prompt");
          state = choose(work, state, "letter-new");
          state = dispatch(work, state, "read", "sms-prompt");
          state = choose(work, state, "sms-new");
          expect(storyValues(work, state).reunion).toBe("5");
          expect(storyValues(work, state).transfer).toBe("95");
          const recovered = JSON.parse(JSON.stringify(state));
          expect(storyValues(work, recovered)).toEqual(
            storyValues(work, state),
          );
          const day = renderStoryItem(work.data.twitter[0], values);
          expect(day.body).not.toContain("{{");
          if (late) expect(day.body).not.toContain(ex + " 下意識");
        }
      });
    }
  }
  it("clamps the complementary tendencies at both bounds", () => {
    const state = initialRuntime(work);
    for (const [initial, delta, expected] of [
      [0, -50, "0"],
      [100, 50, "100"],
    ] as const) {
      state.ui = {
        notes: {
          profile: JSON.stringify({
            name: "小雨",
            men: men.slice(0, 6),
            ex: men[0],
            late: false,
            reason: "信任破裂",
            reunion: initial,
          }),
        },
      };
      state.variables.reunionDelta = delta;
      const v = storyValues(work, state);
      expect(v.reunion).toBe(expected);
      expect(Number(v.reunion) + Number(v.transfer)).toBe(100);
    }
  });
});
