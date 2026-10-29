import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime } from "../schema";
import { profileConfig, saveProfile, renderStoryItem } from "./profile";
import { seasonValues, travelPlan, packSeasonAnswer } from "./season";
import { momentFor, packMoment } from "./encounters";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(seed = "travel") {
  const p = {
    ...saveProfile(
      {
        name: "小雨",
        men: config.men.slice(0, 6),
        ex: config.men[0],
        late: false,
        reason: config.reasons[0],
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
function put(state: Runtime, id: string, value: object) {
  state.ui!.kakao!["answer:" + id] = JSON.stringify(value);
}
it("travel matching produces six distinct pairs independently of flight group or nightly recipient", () => {
  for (let seed = 0; seed < 12; seed++) {
    const { p, state } = setup(String(seed));
    put(state, "d13-travel", { value: p.men[seed % 6] });
    const pairs = travelPlan(p, config, state);
    expect(Object.keys(pairs)).toHaveLength(6);
    expect(new Set(Object.values(pairs)).size).toBe(6);
    put(state, "d14-flight", { value: "第二組" });
    put(state, "d14-recipient", { value: p.men[(seed + 1) % 6] });
    expect(travelPlan(p, config, state)).toEqual(pairs);
  }
});
it("both flight choices keep every travel pair together, three men and three women per group", () => {
  for (const seed of ["one", "two", "three", "four"]) {
    const { p, state } = setup(seed);
    put(state, "d13-travel", { value: p.men[2] });
    const pairs = travelPlan(p, config, state),
      partner = pairs[p.name];
    for (const flight of ["第一組", "第二組"]) {
      put(state, "d14-flight", { value: flight });
      const values = seasonValues(work, state, p, config);
      expect(values.travelPartner).toBe(partner);
      const groups = values.flightRoster.split("\n");
      expect(groups).toHaveLength(2);
      const seen = new Set<string>();
      for (const line of groups) {
        const [men, women] = line
          .split("：")[1]
          .replace(/。$/u, "")
          .split("；")
          .map((names) => names.split("、"));
        expect(men).toHaveLength(3);
        expect(women).toHaveLength(3);
        for (const woman of women) {
          expect(men).toContain(pairs[woman]);
          expect(seen.has(woman)).toBe(false);
          seen.add(woman);
        }
      }
      const chosen = groups[flight === "第一組" ? 0 : 1];
      expect(chosen).toContain(p.name);
      expect(chosen).toContain(partner);
    }
  }
});
it("confirmed travel pairs are saved and survive the group decision and reload", () => {
  const { p, state } = setup();
  state.unlocked.push("d13-travel");
  const record = JSON.parse(
    packSeasonAnswer(work, state, "d13-travel", p.men[1])!,
  );
  expect(Object.keys(record.travelPairs)).toHaveLength(6);
  put(state, "d13-travel", record);
  const before = seasonValues(work, state, p, config).travelPartner;
  put(state, "d14-flight", { value: "第二組" });
  expect(
    seasonValues(work, JSON.parse(JSON.stringify(state)), p, config)
      .travelPartner,
  ).toBe(before);
});
it("date questions and the post carry the actual partner's name while anonymous preparation stays anonymous", () => {
  const { p, state } = setup();
  put(state, "d2-date", { value: p.men[1] });
  const values = seasonValues(work, state, p, config);
  const question = renderStoryItem(
    work.data.kakao.find((i) => i.id === "d2-date-choice-a")!,
    values,
  );
  expect(question.meta.interactionWith).toContain(values.date2);
  expect(question.meta.choicePrompt).toBe(values.dateQuestion2a);
  expect(question.body).toContain(values.date2);
  const post = renderStoryItem(
    work.data.twitter.find((i) => i.id === "d2-date-scene")!,
    values,
  );
  expect(post.body).toContain(`約會對象：${values.date2}`);
  const anonymous = renderStoryItem(
    work.data.kakao.find((i) => i.id === "d2-anon")!,
    values,
  );
  expect(anonymous.meta.interactionWith).toBe("匿名聊天室｜你的約會對象的 X");
  expect(anonymous.meta.interactionWith).not.toContain(p.ex);
});
it("a chosen female guest is labelled correctly rather than defaulting to a male actor", () => {
  const { p, state } = setup();
  const day = 4;
  const moment = momentFor(work, state, p, config, day)!;
  const focus = packMoment(
    work,
    state,
    p,
    config,
    day,
    "focus",
    moment.options[2],
  )!;
  put(state, "d4-focus", focus);
  const after = momentFor(work, state, p, config, day)!,
    values = seasonValues(work, state, p, config);
  const question = renderStoryItem(
    work.data.kakao.find((i) => i.id === "d4-approach")!,
    values,
  );
  expect(question.meta.interactionWith).toContain(
    after.target || after.names.woman,
  );
  expect(question.meta.choicePrompt).toBe(after.prompt);
  expect(question.body).toContain(after.target || after.names.woman);
});
