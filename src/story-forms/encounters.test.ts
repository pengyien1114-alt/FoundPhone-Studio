import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime } from "../schema";
import { profileConfig, renderStoryItem, saveProfile } from "./profile";
import { houseMoments, momentFor, packMoment } from "./encounters";
import { packSeasonAnswer, seasonValues } from "./season";
import { relationships, selected } from "./relationships";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(seed = "house", late = false, reason = 0) {
  const p = {
    ...saveProfile(
      {
        name: "小雨",
        men: config.men.slice(0, 6),
        ex: config.men[0],
        late,
        reason: config.reasons[reason],
        reunion: 50,
      },
      config,
      () => 0.5,
    ),
    seed,
  };
  const state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  return { p, state };
}
function save(state: Runtime, id: string, value: unknown) {
  state.ui!.kakao!["answer:" + id] = JSON.stringify(value);
}
it("draws different, nonrepeating phase decks and never casts a guest who has not arrived", () => {
  const sequences = new Set();
  for (const late of [false, true])
    for (const seed of ["one", "two", "three", "four"]) {
      const { p, state } = setup(seed, late),
        ids = [];
      for (let day = 1; day <= 21; day++) {
        const m = momentFor(work, state, p, config, day)!;
        ids.push(m.scene.id);
        expect(m.scene.phase).toBe(day < 7 ? 0 : day < 14 ? 1 : 2);
        expect(m.names.a).not.toBe(m.names.b);
        expect(m.options).toHaveLength(3);
        expect(m.options.every((o) => !p.men.includes(o))).toBe(true);
        if (late && day < 10)
          expect([m.names.a, m.names.b, m.names.other]).not.toContain(p.ex);
        expect(m.opening).not.toMatch(
          /\{\{|undefined|想把這段時間留給誰|當面聊一會兒/,
        );
        const snap = structuredClone(state);
        expect(momentFor(work, snap, p, config, day)?.scene.id).toBe(
          m.scene.id,
        );
        save(
          state,
          `d${day}-focus`,
          packMoment(work, state, p, config, day, "focus", m.options[0]),
        );
        const current = momentFor(work, state, p, config, day)!;
        save(
          state,
          `d${day}-approach`,
          packMoment(
            work,
            state,
            p,
            config,
            day,
            "approach",
            current.choices[0].line,
          ),
        );
      }
      expect(new Set(ids).size).toBe(21);
      sequences.add(ids.join("|"));
    }
  expect(sequences.size).toBe(8);
  expect(houseMoments(work)).toHaveLength(24);
});
it("every scene branch has a payoff, a private reply or a complete female-companion exit", () => {
  for (let day = 1; day <= 21; day++)
    for (let branch = 0; branch < 3; branch++) {
      const { p, state } = setup("branches", false, 2);
      let m = momentFor(work, state, p, config, day)!;
      const first = packMoment(
        work,
        state,
        p,
        config,
        day,
        "focus",
        m.options[branch],
      )!;
      save(state, `d${day}-focus`, first);
      m = momentFor(work, state, p, config, day)!;
      expect(m.choices.length).toBeGreaterThan(0);
      const before = relationships(work, state, p, config);
      const response = packMoment(
        work,
        state,
        p,
        config,
        day,
        "approach",
        m.choices[0].line,
      )!;
      save(state, `d${day}-approach`, response);
      const values = seasonValues(work, state, p, config);
      expect(values[`interaction${day}`].length).toBeGreaterThan(70);
      expect(values[`interaction${day}`]).not.toMatch(
        /\{\{|undefined|「「|先問.+現在方不方便|不給彼此更多期待/,
      );
      expect(selected(state, `d${day}-focus`)).toBe(first.target);
      const after = relationships(work, state, p, config);
      expect(relationships(work, state, p, config)).toEqual(after);
      if (branch === 2) {
        expect(first.target).toBe("");
        expect(response.sceneMeeting).toBe(false);
        expect(after).toEqual(before);
      } else
        expect(after[first.target].meetings).toBe(
          before[first.target].meetings + 1,
        );
    }
});
it("shuffles the emotional tradeoffs so the highest-trust choice is not always first", () => {
  const positions = new Set<number>();
  for (const seed of ["a", "b", "c", "d", "e"]) {
    const { p, state } = setup(seed);
    for (const day of [2, 5, 9, 16]) {
      let m = momentFor(work, state, p, config, day)!;
      save(
        state,
        `d${day}-focus`,
        packMoment(work, state, p, config, day, "focus", m.options[0]),
      );
      m = momentFor(work, state, p, config, day)!;
      const best = [...m.choices].sort(
        (a, b) => (b.effect.trust || 0) - (a.effect.trust || 0),
      )[0];
      positions.add(m.choices.indexOf(best));
    }
  }
  expect(positions.has(0)).toBe(true);
  expect(positions.has(1)).toBe(true);
  expect(positions.has(2)).toBe(true);
});
it("keeps each X background private and does not replay its same phase speech on the next encounter", () => {
  for (let reason = 0; reason < 6; reason++) {
    const { p, state } = setup("private", false, reason);
    let talks = 0;
    for (let day = 1; day <= 6; day++) {
      let m = momentFor(work, state, p, config, day)!;
      const index = m.scene.branches.findIndex(
        (b) => b.target && m.names[b.target] === p.ex,
      );
      if (index < 0) continue;
      save(
        state,
        `d${day}-focus`,
        packMoment(work, state, p, config, day, "focus", m.options[index]),
      );
      m = momentFor(work, state, p, config, day)!;
      expect(!!m.beat).toBe(talks === 0);
      save(
        state,
        `d${day}-approach`,
        packMoment(work, state, p, config, day, "approach", m.choices[0].line),
      );
      const values = seasonValues(work, state, p, config);
      const item = renderStoryItem(
        work.data.twitter.find((i) => i.id === `d${day}-response`)!,
        values,
      );
      expect(item.meta.visibility).toBe("player");
      expect(item.comments).toEqual([]);
      expect(values[`discussion${day}`]).toBe("");
      talks++;
    }
    expect(talks).toBeGreaterThanOrEqual(1);
  }
});
it("retains chosen actions, effects and recorded scenes across refreshes and future-day choices", () => {
  const { p, state } = setup("history");
  const first = momentFor(work, state, p, config, 1)!;
  state.unlocked.push("d1-focus");
  const value = packSeasonAnswer(work, state, "d1-focus", first.options[0])!;
  expect(value).toBeDefined();
  state.ui!.kakao!["answer:d1-focus"] = value;
  const next = momentFor(work, state, p, config, 1)!;
  state.unlocked.push("d1-approach");
  state.ui!.kakao!["answer:d1-approach"] = packSeasonAnswer(
    work,
    state,
    "d1-approach",
    next.choices[0].line,
  )!;
  const previous = seasonValues(work, state, p, config).interaction1;
  save(state, "d21-recipient", { value: p.men[3] });
  save(state, "d21-focus", {
    value: "not the old scene",
    target: p.men[2],
    sceneId: "quiet-door",
  });
  expect(
    seasonValues(work, structuredClone(state), p, config).interaction1,
  ).toBe(previous);
  expect(
    packSeasonAnswer(work, state, "d1-approach", "a made-up answer"),
  ).toBeUndefined();
});
