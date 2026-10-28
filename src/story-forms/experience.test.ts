import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime } from "../schema";
import { profileConfig, renderStoryItem, saveProfile } from "./profile";
import { packSeasonAnswer, seasonValues } from "./season";
import { relationships } from "./relationships";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(reason = 0) {
  const p = saveProfile(
    {
      name: "小雨",
      men: config.men.slice(0, 6),
      ex: config.men[0],
      late: false,
      reason: config.reasons[reason],
      reunion: 50,
    },
    config,
    () => 0.5,
  );
  const state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  return { p, state };
}
it(
  "never offers a selected evening line again with the same person, including every X background",
  { timeout: 15000 },
  () => {
    for (const reason of [0, 1, 2, 3, 4, 5])
      for (const ex of [true, false]) {
        const { p, state } = setup(reason),
          used = new Set<string>();
        for (let d = 1; d <= 20; d++) {
          state.ui!.kakao![`answer:d${d}-focus`] = JSON.stringify({
            value: ex ? p.ex : p.men[1],
          });
          const opts = JSON.parse(
            seasonValues(work, state, p, config)[`conversationOptions${d}`],
          ) as string[];
          expect(opts.some((option) => used.has(option))).toBe(false);
          const chosen = opts[(d - 1) % 3];
          state.ui!.kakao![`answer:d${d}-approach`] = JSON.stringify({
            value: chosen,
            optionIndex: (d - 1) % 3,
            exBranch: ex,
          });
          used.add(chosen);
        }
      }
  },
);
it("strips all audience comments and counters from private prereveal records", () => {
  const { p, state } = setup();
  state.ui!.kakao!["answer:d2-focus"] = JSON.stringify({ value: p.ex });
  state.ui!.kakao!["answer:d2-approach"] = JSON.stringify({
    value: "已說過的私下談話",
    optionIndex: 0,
  });
  const values = seasonValues(work, state, p, config);
  for (const id of ["d0-meeting", "d2-response", "d7-room-result"]) {
    const item = renderStoryItem(
      work.data.twitter.find((i) => i.id === id)!,
      values,
    );
    expect(item.meta.visibility).toBe("player");
    expect(item.comments).toEqual([]);
    expect(item.likes).toBe(0);
    expect(item.meta.views).toBe("0");
  }
  expect(values.discussion2).toBe("");
  expect(
    renderStoryItem(
      work.data.twitter.find((i) => i.id === "d14-reveal")!,
      values,
    ).comments.length,
  ).toBeGreaterThan(0);
});
it("date choices change the actual date partner's bond once and produce distinct replies", () => {
  const { p, state } = setup();
  state.ui!.kakao!["answer:d2-date"] = JSON.stringify({ value: p.men[1] });
  const target = seasonValues(work, state, p, config).date2;
  const before = relationships(work, state, p, config)[target];
  const item = work.data.kakao.find((i) => i.id === "d2-date-choice-a")!;
  state.unlocked.push(item.id);
  const options = JSON.parse(
    renderStoryItem(item, seasonValues(work, state, p, config)).meta.options,
  );
  const outcomes = [];
  for (let index = 0; index < 3; index++) {
    delete state.ui!.kakao!["answer:" + item.id];
    const packed = packSeasonAnswer(work, state, item.id, options[index])!;
    expect(JSON.parse(packed).dateTarget).toBe(target);
    state.ui!.kakao!["answer:" + item.id] = packed;
    outcomes.push(relationships(work, state, p, config)[target]);
    expect(
      seasonValues(work, state, p, config).dateReply2a.length,
    ).toBeGreaterThan(35);
    expect(relationships(work, state, p, config)[target]).toEqual(
      outcomes[index],
    );
  }
  expect(outcomes[0].affinity).not.toBe(outcomes[1].affinity);
  expect(outcomes[0].trust).not.toBe(outcomes[1].trust);
  expect(outcomes.every((r) => r.trust >= before.trust)).toBe(true);
  expect(outcomes[0].meetings).toBe(before.meetings + 1);
});
it("a failed mutual date offers solo activities and cannot grant an imaginary partner points", () => {
  const { p, state } = setup();
  state.ui!.kakao!["answer:d13-mutual"] = JSON.stringify({ value: p.men[1] });
  const values = seasonValues(work, state, p, config);
  expect(values.mutualSuccess).toBe("false");
  const item = work.data.kakao.find((i) => i.id === "d13-date-choice-a")!;
  const opts = JSON.parse(renderStoryItem(item, values).meta.options);
  expect(opts[0]).toContain("留下來");
  state.unlocked.push(item.id);
  const before = relationships(work, state, p, config);
  state.ui!.kakao!["answer:" + item.id] = packSeasonAnswer(
    work,
    state,
    item.id,
    opts[0],
  )!;
  expect(relationships(work, state, p, config)).toEqual(before);
  expect(seasonValues(work, state, p, config).dateReply13a).toContain("菜");
});
it("keeps the first-date reflection after two real decisions and imports only the audio stream", () => {
  const path = story.tests[0].steps.map((i) => i.target || "");
  expect(path.indexOf("d2-date-end")).toBeLessThan(
    path.indexOf("ui:kakao:answer:d2-observation"),
  );
  expect(path).toContain("ui:kakao:answer:d2-date-choice-a");
  expect(path).toContain("ui:kakao:answer:d2-date-choice-b");
  const music = work.data.music.find((i) => i.meta.opening === "true")!;
  expect(music.media).toMatch(/^data:audio\/mp4;base64,/);
  expect(music.title).toBe("SUN OR SUCK");
  expect(music.sender).toBe("WOODZ");
});

it("date answer echoes stay outgoing and never block the next production question", () => {
  for (const item of work.data.kakao.filter(
    (i) => i.id.startsWith("echo-") && i.id.includes("-date-choice-"),
  )) {
    expect(item.outgoing).toBe(true);
    expect(item.title).toBe("換乘戀愛節目組");
  }
});
