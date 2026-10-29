import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime } from "../schema";
import { profileConfig, saveProfile, castFor } from "./profile";
import { hiddenAffections, relationships } from "./relationships";
import { chooseHearts, heartRules, type HeartCell } from "./hearts";
import {
  nightlyChoices,
  packSeasonAnswer,
  residentCast,
  storedVotes,
} from "./season";
import { smsChoices } from "./messages";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(seed = "hearts", late = false) {
  const p = {
    ...saveProfile(
      {
        name: "小雨",
        men: config.men.slice(0, 6),
        ex: config.men[0],
        late,
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
function put(s: Runtime, id: string, value: object) {
  s.ui!.kakao!["answer:" + id] = JSON.stringify(value);
}
function meet(s: Runtime, day: number, target: string, pressure = false) {
  put(s, `d${day}-focus`, { target });
  put(s, `d${day}-approach`, {
    value: "saved authored reply",
    sceneId: `saved-${day}`,
    target,
    sceneSignal: pressure ? -1 : 1,
    sceneMeeting: true,
    sceneEffect: pressure
      ? { affinity: -3, trust: -2, pressure: 3 }
      : { affinity: 3, trust: 3, clarity: 1 },
  });
}
it("the hidden table includes only residents and all NPCs choose one present opposite-sex guest", () => {
  for (const day of [2, 3, 7, 10, 14, 21])
    for (const late of [false, true]) {
      const { p, state } = setup("cast", late),
        cast = residentCast(p, config, day),
        plan = nightlyChoices(work, p, config, state, day);
      expect(Object.keys(plan.recipients)).toHaveLength(
        cast.men.length + cast.women.length - 1,
      );
      for (const [from, to] of Object.entries(plan.recipients))
        expect(cast.men.includes(from) ? cast.women : cast.men).toContain(to);
      for (const row of Object.values(plan.table))
        for (const cell of Object.values(row))
          expect(Number.isFinite(cell.score)).toBe(true);
    }
});
it("uncontacted new guests do not all develop a romantic interest on day two", () => {
  const { p, state } = setup();
  const table = hiddenAffections(work, state, p, config, 2);
  for (const man of castFor(p, config).presentMen)
    if (man !== p.ex) expect(table[man][p.name].eligible).toBe(false);
  expect(
    Object.values(nightlyChoices(work, p, config, state, 2).recipients).filter(
      (to) => to === p.name,
    ).length,
  ).toBeLessThanOrEqual(1);
});
it("anonymous outgoing messages cannot farm NPC attraction or erase pressure", () => {
  const { p, state } = setup(),
    target = p.men[1];
  meet(state, 2, target, true);
  const before = hiddenAffections(work, state, p, config, 21)[target][p.name];
  for (let d = 1; d < 21; d++) {
    put(state, `d${d}-recipient`, { value: target });
    put(state, `d${d}-sms`, {
      value: `message-${d}`,
      smsVersion: 2,
      smsEffect: { affinity: 20, trust: 10, pressure: -5, clarity: 1 },
      votes: [{ from: p.name, to: target, text: `message-${d}` }],
    });
  }
  expect(hiddenAffections(work, state, p, config, 21)[target][p.name]).toEqual(
    before,
  );
  expect(
    relationships(work, state, p, config, 21, false)[target].pressure,
  ).toBe(3);
});
it("a two-choice date is one actual meeting and only affects the actual partner", () => {
  const { p, state } = setup(),
    target = p.men[1];
  const before = hiddenAffections(work, state, p, config, 2);
  put(state, "d2-date-choice-a", {
    value: "a",
    optionIndex: 0,
    characterDate: true,
    dateTarget: target,
    sceneEffect: { affinity: 3, trust: 2 },
  });
  put(state, "d2-date-choice-b", {
    value: "b",
    optionIndex: 0,
    characterDate: true,
    dateTarget: target,
    sceneEffect: { affinity: 2, trust: 2 },
  });
  const r = relationships(work, state, p, config, 2, false)[target],
    after = hiddenAffections(work, state, p, config, 2);
  expect(r.meetings).toBe(1);
  expect(after[target][p.name].eligible).toBe(true);
  expect(after[target][p.name].score).toBeGreaterThan(
    before[target][p.name].score,
  );
  for (const man of Object.keys(before))
    if (man !== target) expect(after[man]).toEqual(before[man]);
  expect(hiddenAffections(work, state, p, config, 2)).toEqual(after);
});
it("a difficult date reduces willingness instead of receiving an automatic date bonus", () => {
  const warm = setup(),
    cold = setup(),
    target = warm.p.men[1];
  meet(warm.state, 2, target);
  meet(cold.state, 2, target, true);
  expect(
    hiddenAffections(work, warm.state, warm.p, config, 2)[target][warm.p.name]
      .score,
  ).toBeGreaterThan(
    hiddenAffections(work, cold.state, cold.p, config, 2)[target][cold.p.name]
      .score,
  );
});
it("does not cap a genuinely strong preference shared by more than three guests", () => {
  const cell = (score: number): HeartCell => ({
    score,
    attraction: score,
    trust: 0,
    pressure: 0,
    eligible: true,
  });
  const table = Object.fromEntries(
    ["a", "b", "c", "d", "e"].map((from, i) => [
      from,
      { player: cell(50 + i), other: cell(20) },
    ]),
  );
  expect(
    Object.values(chooseHearts(table)).filter((to) => to === "player"),
  ).toHaveLength(5);
  expect(chooseHearts({ a: { player: cell(1), other: cell(2) } })).toEqual({
    a: "other",
  });
});
it("every NPC chooses its strongest eligible preference without forcing any receipt count", () => {
  const counts = new Set<number>();
  for (let seed = 0; seed < 24; seed++)
    for (const late of [false, true]) {
      const { p, state } = setup(String(seed), late);
      const present = castFor(p, config).presentMen;
      meet(
        state,
        1,
        present.find((m) => m !== p.ex)!,
      );
      for (const day of [2, 3, 7, 10, 14, 21]) {
        if (day > 2) meet(state, day, p.men[(day + seed) % p.men.length]);
        const plan = nightlyChoices(work, p, config, state, day),
          count = Object.values(plan.recipients).filter(
            (to) => to === p.name,
          ).length;
        counts.add(count);
        for (const [from, to] of Object.entries(plan.recipients)) {
          const cell = plan.table[from][to];
          expect(cell.eligible).toBe(true);
          for (const other of Object.values(plan.table[from]))
            if (other.eligible)
              expect(cell.score).toBeGreaterThanOrEqual(other.score);
        }
      }
    }
  expect(counts.size).toBeGreaterThan(1);
  expect(Math.min(...counts)).toBeLessThan(3);
  expect(heartRules(work)).not.toHaveProperty("inboxLimit");
});
it("future actions, choices of recipient and the player's own initial reunion wish cannot dictate an earlier NPC ballot", () => {
  const { p, state } = setup(),
    before = nightlyChoices(work, p, config, state, 2);
  meet(state, 20, p.men[2]);
  put(state, "d2-recipient", { value: p.ex });
  expect(nightlyChoices(work, p, config, state, 2)).toEqual(before);
  expect(
    nightlyChoices(work, { ...p, reunion: 100 }, config, state, 2),
  ).toEqual(before);
  put(state, "d2-recipient", { value: p.men[2] });
  expect(nightlyChoices(work, p, config, state, 2)).toEqual(before);
});
it("NPC shared-date evidence is recorded separately and does not automatically determine their ballot", () => {
  const { p, state } = setup(),
    cast = castFor(p, config),
    man = cast.presentMen[1],
    woman = cast.presentWomen[1];
  const before = hiddenAffections(work, state, p, config, 3);
  put(state, "d2-date-choice-a", { datePairs: { [woman]: man } });
  expect(hiddenAffections(work, state, p, config, 3)).toEqual(before);
  put(state, "d2-date-choice-b", { datePairs: { [woman]: man } });
  const after = hiddenAffections(work, state, p, config, 3);
  expect(after[man][woman].trust - before[man][woman].trust).toBe(1);
  expect(after[man][p.name]).toEqual(before[man][p.name]);
});
it("sending locks the private score snapshot and all cast ballots, preserving old receipts", () => {
  const { p, state } = setup(),
    target = castFor(p, config).presentMen[0];
  put(state, "d2-recipient", { value: target });
  state.unlocked.push("d2-sms");
  const choice = smsChoices(work, state, p, config, 2)[0];
  const packed = packSeasonAnswer(work, state, "d2-sms", choice.text)!;
  expect(packed).toBeDefined();
  const record = JSON.parse(packed);
  expect(record.heartVersion).toBe(1);
  expect(record.heartScores).toBeDefined();
  expect(record.votes).toHaveLength(10);
  expect(
    record.votes.filter((v: { to: string }) => v.to === p.name).length,
  ).toBeLessThanOrEqual(5);
  state.ui!.kakao!["answer:d2-sms"] = packed;
  const original = storedVotes(state, 2);
  meet(state, 20, target);
  expect(storedVotes(state, 2)).toEqual(original);
  // Already-delivered legacy letters are recordings, not recalculated wishes.
  put(state, "d2-sms", {
    value: "legacy",
    votes: p.men
      .slice(0, 4)
      .map((from) => ({ from, to: p.name, text: "old recording" })),
  });
  expect(storedVotes(state, 2)).toHaveLength(4);
});
