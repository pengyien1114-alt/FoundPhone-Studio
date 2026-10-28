import { describe, expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime } from "../schema";
import { choose, dispatch, visible } from "../engine";
import story from "../../stories/template/story.json";
import {
  castFor,
  saveProfile,
  groupEpisodeItems,
  parseProfile,
  renderStoryItem,
  storyValues,
} from "./profile";

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
      reason: JSON.parse(work.data.notes[0].meta.profileForm).reasons[0],
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
                reason: JSON.parse(work.data.notes[0].meta.profileForm)
                  .reasons[0],
                reunion: 50,
              }),
            },
          };
          state = dispatch(work, state, "variable", "ui:notes:profile");
          const values = storyValues(work, state);
          expect(values.pairs.split("\n")).toHaveLength(6);
          expect(values.pairs).toContain("小雨 ↔ " + ex);
          expect(values.present.includes(ex)).toBe(!late);
          expect(values.present.split("、")).toHaveLength(5);
          expect(values.men).not.toContain(men[omit]);
          state = dispatch(work, state, "read", "day1");
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
          state = dispatch(work, state, "read", "x-dinner-new");
          state = dispatch(work, state, "read", "letter-prompt");
          state = choose(work, state, "letter-new");
          state = dispatch(work, state, "read", "x-letter-new");
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
            reason: JSON.parse(work.data.notes[0].meta.profileForm).reasons[0],
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

const reasonConfig = JSON.parse(work.data.notes[0].meta.profileForm);
for (const [reasonIndex, reason] of reasonConfig.reasons.entries()) {
  for (const late of [false, true]) {
    for (const direction of ["past", "new", "self"]) {
      it(`reason ${reasonIndex + 1}, late ${late}, ${direction}: staged narration and history`, () => {
        let state = initialRuntime(work);
        state.ui = {
          notes: {
            profile: JSON.stringify({
              name: "小雨",
              men: men.slice(0, 6),
              ex: men[0],
              late,
              reason,
              reunion: 50,
            }),
          },
        };
        state = dispatch(work, state, "variable", "ui:notes:profile");
        const item = (id: string) =>
          Object.values(work.data)
            .flat()
            .find((i) => i.id === id)!;
        expect(visible(item("dinner-prompt"), state)).toBe(false);
        state = dispatch(work, state, "read", "day1");
        expect(visible(item("dinner-prompt"), state)).toBe(true);
        for (const stage of ["dinner", "letter", "sms"]) {
          state = dispatch(work, state, "read", stage + "-prompt");
          state = choose(work, state, stage + "-" + direction);
          const next =
            stage === "dinner"
              ? "letter-prompt"
              : stage === "letter"
                ? "sms-prompt"
                : null;
          if (next) expect(visible(item(next), state)).toBe(false);
          state = dispatch(work, state, "read", "x-" + stage + "-" + direction);
          if (next) expect(visible(item(next), state)).toBe(true);
          const values = storyValues(work, state);
          const rendered = renderStoryItem(
            item("x-" + stage + "-" + direction),
            values,
          );
          expect(rendered.body).not.toContain("{{");
          const background = JSON.parse(
            work.data.notes[0].meta["backstory" + reasonIndex],
          );
          expect(rendered.body).toContain(values[stage + "Feeling"]);
          if (late) expect(values.xResponse).toContain("尚未入住");
          if (stage === "dinner")
            expect(rendered.body).toContain(background.letter);
        }
        expect(storyValues(work, state).history).toContain(men[0]);
        if (reasonIndex === 2)
          expect(storyValues(work, state).history).toContain("離婚半年");
        if (reasonIndex === 4)
          expect(storyValues(work, state).history).toContain("都已成年");
      });
    }
  }
}

it("saves one male and one female catfish once and keeps their first-day scenes absent", () => {
  const config = reasonConfig;
  for (const late of [false, true]) {
    for (let maleIndex = 0; maleIndex < 5; maleIndex++) {
      for (let femaleIndex = 0; femaleIndex < 5; femaleIndex++) {
        const draws = [maleIndex / 5, femaleIndex / 5];
        if (late) draws.shift();
        const profile = saveProfile(
          {
            name: "小雨",
            men: men.slice(0, 6),
            ex: men[0],
            late,
            reason: config.reasons[0],
            reunion: 50,
          },
          config,
          () => draws.shift()!,
        );
        const restored = parseProfile(JSON.stringify(profile))!;
        const cast = castFor(restored, config);
        expect(castFor(profile, config)).toEqual(cast);
        expect(cast.male === profile.ex).toBe(late);
        expect(cast.presentMen).toHaveLength(5);
        expect(cast.presentWomen).toHaveLength(4);
        expect(cast.presentMen).not.toContain(cast.male);
        expect(cast.presentWomen).not.toContain(cast.female);
        expect(cast.presentMen).toContain(late ? men[1] : profile.ex);
        const state = initialRuntime(work);
        state.ui = { notes: { profile: JSON.stringify(restored) } };
        const values = storyValues(work, state);
        expect(values.presentWomen.split("、")).toHaveLength(5);
        expect(cast.presentMen).toContain(values.other);
        for (const post of work.data.twitter) {
          const rendered = renderStoryItem(post, values);
          expect(rendered.body).not.toContain(cast.male);
          expect(rendered.body).not.toContain(cast.female);
          expect(rendered.body).not.toContain("{{");
        }
      }
    }
  }
});

it("keeps all X posts above five comments and EP.1 in one growing discussion with no future leaks", () => {
  for (const post of work.data.twitter)
    expect(post.comments.length).toBeGreaterThanOrEqual(5);
  let state = initialRuntime(work);
  state = dispatch(work, state, "variable", "ui:notes:profile");
  const episodes = () =>
    groupEpisodeItems(work.data.safari.filter((i) => visible(i, state)));
  expect(episodes()).toHaveLength(2);
  const ep1 = () => episodes().find((i) => i.id === "forum-day1")!;
  expect(ep1().body.match(/^\d+樓/gm)).toHaveLength(30);
  expect(ep1().body).not.toContain("接行李那一對今晚有後續嗎");
  state = dispatch(work, state, "read", "day1");
  for (const stage of ["dinner", "letter", "sms"]) {
    state = dispatch(work, state, "read", stage + "-prompt");
    state = choose(work, state, stage + "-new");
    state = dispatch(work, state, "read", "x-" + stage + "-new");
  }
  expect(episodes()).toHaveLength(2);
  expect(ep1().body.match(/^\d+樓/gm)).toHaveLength(60);
  expect(ep1().body).toContain("接行李那一對今晚有後續嗎");
  expect(ep1().body).not.toContain("她先和女嘉賓們整理餐桌");
  expect(episodes().find((i) => i.id === "forum-ep2")!.body).toContain(
    "本集尚未播出",
  );
});
