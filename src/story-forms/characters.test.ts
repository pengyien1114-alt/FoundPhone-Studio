import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime } from "../schema";
import { profileConfig, saveProfile, renderStoryItem } from "./profile";
import {
  characterBook,
  characterScene,
  dateRoute,
  recallFor,
} from "./characters";
import { momentFor, packMoment } from "./encounters";
import { seasonValues, packSeasonAnswer } from "./season";
import { relationships, publicPartner } from "./relationships";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup() {
  const p = saveProfile(
    {
      name: "小雨",
      men: config.men.slice(0, 6),
      ex: config.men[0],
      late: false,
      reason: config.reasons[1],
      reunion: 50,
    },
    config,
    () => 0.5,
  );
  const state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  return { p, state };
}
it("gives all eight men distinct situations, questions, actions and consequences in all three phases", () => {
  const book = characterBook(work);
  expect(book.men).toHaveLength(8);
  for (const phase of [0, 1, 2]) {
    const scenes = book.men.map((m) =>
      m.scenes.find((s) => s.phase === phase)!,
    );
    for (const field of ["intro", "action", "prompt"] as const)
      expect(new Set(scenes.map((s) => s[field])).size).toBe(8);
    expect(new Set(scenes.map((s) => s.choices[0].result)).size).toBe(8);
    for (const scene of scenes) {
      expect(
        scene.choices.every((c) => c.line.length > 5 && c.result.length > 35),
      ).toBe(true);
      expect(new Set(scene.choices.map((c) => c.line)).size).toBe(
        scene.choices.length,
      );
    }
  }
});
it("changes date questions, choices and the second half for the actual partner and first answer", () => {
  const { p, state } = setup();
  for (const day of [2, 3, 10, 13]) {
    const routes = config.men.map((name) =>
      dateRoute(work, state, day, name, p.ex)!,
    );
    expect(new Set(routes.map((r) => r.opening)).size).toBe(8);
    expect(new Set(routes.map((r) => r.questionA)).size).toBe(8);
    expect(new Set(routes.map((r) => r.questionB)).size).toBe(8);
    expect(new Set(routes.map((r) => r.choicesA[0].line)).size).toBe(8);
    for (let i = 0; i < config.men.length; i++) {
      const first = routes[i];
      state.ui!.kakao![`answer:d${day}-date-choice-a`] = JSON.stringify({
        characterDate: true,
        optionIndex: 1,
      });
      const changed = dateRoute(work, state, day, config.men[i], p.ex)!;
      expect(changed.middle).not.toBe(first.middle);
      delete state.ui!.kakao![`answer:d${day}-date-choice-a`];
    }
  }
});
it("continues a repeat date from the recorded answer and gives a real chance to change that answer", () => {
  const { p, state } = setup(),
    name = config.men[1];
  const first = dateRoute(work, state, 2, name, p.ex)!;
  state.ui!.kakao!["answer:d2-date-choice-b"] = JSON.stringify({
    characterDate: true,
    dateTarget: name,
    value: first.choicesB[0].line,
    dateQuestion: first.questionB,
    optionIndex: 0,
  });
  const next = dateRoute(work, state, 3, name, p.ex)!;
  expect(next.questionB).toContain(
    first.choicesB[0].line.replace(/^[「“]|[」”]$/g, ""),
  );
  expect(next.choicesB.some((c) => c.line === first.choicesB[0].line)).toBe(
    false,
  );
  expect(next.choicesB.some((c) => c.line.includes("有不一樣"))).toBe(true);
  expect(next.choicesB.some((c) => c.line.includes("和上次一樣"))).toBe(true);
});
it("does not treat a third answer as a universal rejection or a first answer as a universal best choice", () => {
  const { p, state } = setup();
  const asksForMore = dateRoute(work, state, 10, "張家豪", p.ex)!.choicesB[2];
  const declines = dateRoute(work, state, 10, "金虔佑", p.ex)!.choicesB[2];
  expect(asksForMore.effect.affinity).toBeGreaterThan(0);
  expect(declines.effect.affinity).toBeLessThan(0);
  const lead = dateRoute(work, state, 2, "金虔佑", p.ex)!;
  expect(lead.choicesA[0].effect.trust).toBeGreaterThan(
    lead.choicesA[1].effect.trust!,
  );
  expect(lead.choicesA[1].effect.affinity).toBeGreaterThan(
    lead.choicesA[0].effect.affinity!,
  );
});
it("recalls only words actually spoken to this person after a full intervening day, and only once", () => {
  const { state } = setup(),
    man = characterBook(work).men[2],
    key = man.memory[0].id;
  state.ui!.kakao!["answer:d1-approach"] = JSON.stringify({
    value: "這兩項我也想選。",
    target: man.name,
    memoryKey: key,
    sceneMeeting: true,
  });
  expect(recallFor(work, state, man.name, 2)).toBeUndefined();
  expect(recallFor(work, state, man.name, 3)?.said).toBe("這兩項我也想選。");
  expect(recallFor(work, state, config.men[1], 3)).toBeUndefined();
  state.ui!.kakao!["answer:d3-approach"] = JSON.stringify({
    target: man.name,
    recallId: key,
  });
  expect(recallFor(work, state, man.name, 5)).toBeUndefined();
});
it("stores a date response and its effects without changing them on refresh or awarding a second meeting", () => {
  const { p, state } = setup();
  state.ui!.kakao!["answer:d2-date"] = JSON.stringify({ value: config.men[1] });
  const id = "d2-date-choice-a";
  state.unlocked.push(id);
  const item = renderStoryItem(
    work.data.kakao.find((i) => i.id === id)!,
    seasonValues(work, state, p, config),
  );
  const before = relationships(work, state, p, config);
  const packed = packSeasonAnswer(
    work,
    state,
    id,
    JSON.parse(item.meta.options)[1],
  )!;
  expect(packed).toBeDefined();
  const record = JSON.parse(packed);
  expect(record.characterDate).toBe(true);
  state.ui!.kakao!["answer:" + id] = packed;
  const after = relationships(work, state, p, config);
  expect(after[record.dateTarget].meetings).toBe(
    before[record.dateTarget].meetings + 1,
  );
  expect(after[record.dateTarget].trust - before[record.dateTarget].trust).toBe(
    record.sceneEffect.trust || 0,
  );
  expect(relationships(work, structuredClone(state), p, config)).toEqual(after);
  expect(seasonValues(work, state, p, config).dateReply2a).toBe(
    record.dateReply,
  );
});
it("has observed female arcs with stable partners and never brings the absent man into them", () => {
  const { p, state } = setup();
  p.late = true;
  p.maleCatfish = p.ex;
  const book = characterBook(work);
  expect(book.women).toHaveLength(5);
  for (const woman of config.women) {
    expect(publicPartner(p, config, woman)).not.toBe(p.ex);
    expect(publicPartner(p, config, woman)).toBe(
      publicPartner({ ...p }, config, woman),
    );
  }
  for (let d = 1; d < 10; d++) {
    const m = momentFor(work, state, p, config, d)!;
    expect(m.opening).not.toContain(p.ex);
    expect(m.opening).not.toMatch(/的X是|的 X 是|曾交往|歲｜/);
  }
});
it("requires actual earlier contact before a new man acts intimately in the late phase", () => {
  const { p, state } = setup(),
    name = config.men[1];
  expect(characterScene(work, name, 2, state, 18, p.ex)?.id).toContain(
    "distant",
  );
  for (const day of [2, 5]) {
    state.ui!.kakao![`answer:d${day}-focus`] = JSON.stringify({ target: name });
    state.ui!.kakao![`answer:d${day}-approach`] = JSON.stringify({
      sceneEffect: { affinity: 3, trust: 3 },
      sceneMeeting: true,
    });
  }
  expect(characterScene(work, name, 2, state, 18, p.ex)?.id).not.toContain(
    "distant",
  );
  expect(characterScene(work, name, 2, state, 3, p.ex)?.id).toContain(
    "distant",
  );
});
it("keeps old date recordings on their original dialogue and preserves new house response snapshots", () => {
  const { p, state } = setup();
  state.ui!.kakao!["answer:d2-date-choice-a"] = JSON.stringify({
    value: "我照著那份建議替他選好，想讓他發現我很懂他。",
    optionIndex: 1,
  });
  expect(dateRoute(work, state, 2, config.men[1], p.ex)).toBeUndefined();
  expect(seasonValues(work, state, p, config).dateQuestion2a).toContain(
    "匿名聊天室",
  );
  let m = momentFor(work, state, p, config, 1)!;
  state.ui!.kakao!["answer:d1-focus"] = JSON.stringify(
    packMoment(work, state, p, config, 1, "focus", m.options[0]),
  );
  m = momentFor(work, state, p, config, 1)!;
  const packed = packMoment(
    work,
    state,
    p,
    config,
    1,
    "approach",
    m.choices[0].line,
  )!;
  state.ui!.kakao!["answer:d1-approach"] = JSON.stringify(packed);
  const before = seasonValues(work, state, p, config).interaction1;
  state.ui!.kakao!["answer:d21-recipient"] = JSON.stringify({ value: p.ex });
  expect(seasonValues(work, state, p, config).interaction1).toBe(before);
  expect(before).toContain(packed.renderedResult);
});
it("offers different positions in pre-interview and never appends an unchosen reproach to a neutral question", () => {
  const { p, state } = setup(),
    values = seasonValues(work, state, p, config);
  const q2 = JSON.parse(
    work.data.kakao.find((i) => i.id === "d0-q2")!.meta.options,
  );
  expect(q2.join("")).toContain("目前不會");
  const q3 = JSON.parse(
    renderStoryItem(
      work.data.kakao.find((i) => i.id === "d0-q3")!,
      values,
    ).meta.options,
  );
  expect(q3.join("")).toContain("聽懂");
  const past = JSON.parse(
    work.data.notes.find((i) => i.id === "unfinished-past")!.body,
  );
  expect(past[1][0].choices[0].result).not.toContain("那你以前幹嘛不學");
  const table = JSON.parse(
    work.data.kakao.find((i) => i.id === "d1-table")!.meta.options,
  );
  expect(table[0]).toContain("直接去找");
  expect(table[1]).toContain("先等");
  expect(table[2]).toContain("暫時不回答");
});
