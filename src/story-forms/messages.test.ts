import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime } from "../schema";
import { profileConfig, saveProfile } from "./profile";
import { incomingToPlayer, smsBook, smsChoices, smsContext } from "./messages";
import { packSeasonAnswer, seasonValues } from "./season";
import { relationships } from "./relationships";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(reason = 0) {
  const p = {
    ...saveProfile(
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
    ),
    seed: "sms-v2",
  };
  const state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  return { p, state };
}
function put(state: Runtime, id: string, value: object) {
  state.ui!.kakao!["answer:" + id] = JSON.stringify(value);
}
it("offers different intentions to an actual recipient and never invents intimacy without contact", () => {
  const { p, state } = setup();
  const target = p.men[1];
  put(state, "d1-recipient", { value: target });
  expect(smsContext(work, state, target, 1, p.ex).mode).toBe("curious");
  const options = smsChoices(work, state, p, config, 1);
  expect(options).toHaveLength(3);
  expect(new Set(options.map((o) => o.intent)).size).toBe(3);
  expect(options.map((o) => o.text).join()).not.toMatch(
    /今天|回來以後|謝謝你|捨不得|想你/,
  );
  expect(smsContext(work, state, p.ex, 1, p.ex).mode).toBe("familiar");
});
it("actual closeness, a difficult reply and returning to someone produce different eligible language", () => {
  const { p, state } = setup(),
    person = p.men[1];
  for (let d = 1; d <= 3; d++) {
    put(state, `d${d}-focus`, { target: person });
    put(state, `d${d}-approach`, { sceneSignal: 1 });
    put(state, `d${d}-recipient`, { value: person });
  }
  expect(smsContext(work, state, person, 4, p.ex).mode).toBe("close");
  put(state, "d4-focus", { target: person });
  put(state, "d4-approach", { sceneSignal: -1 });
  expect(smsContext(work, state, person, 4, p.ex).mode).toBe("tense");
  put(state, "d4-approach", { sceneSignal: 1 });
  put(state, "d4-recipient", { value: p.men[2] });
  expect(smsContext(work, state, person, 5, p.ex).mode).toBe("reconnect");
});
it("six backgrounds have distinct unresolved questions and no direct X identity disclosure", () => {
  const sets = new Set<string>();
  for (let reason = 0; reason < 6; reason++) {
    const { p, state } = setup(reason);
    put(state, "d1-recipient", { value: p.ex });
    const options = smsChoices(work, state, p, config, 1);
    sets.add(JSON.stringify(options));
    expect(options).toHaveLength(3);
    for (const o of options)
      expect(o.text).not.toMatch(/前任|離婚|復合|認識你|金俊抒|張家豪/);
  }
  expect(sets.size).toBe(6);
});
it("21 nights do not recycle a selected outgoing line or a received line", () => {
  for (const ex of [true, false]) {
    const { p, state } = setup(),
      person = ex ? p.ex : p.men[1],
      chosen = new Set<string>(),
      received = new Set<string>();
    for (let day = 1; day <= 21; day++) {
      put(state, `d${day}-recipient`, { value: person });
      const options = smsChoices(work, state, p, config, day);
      expect(options).toHaveLength(3);
      for (const row of options) expect(chosen.has(row.text)).toBe(false);
      const text = incomingToPlayer(work, state, p, config, person, day);
      expect(received.has(text)).toBe(false);
      chosen.add(options[0].text);
      received.add(text);
      put(state, `d${day}-sms`, {
        value: options[0].text,
        smsOptions: options.map((o) => o.text),
        votes: [{ from: person, to: p.name, text }],
      });
    }
  }
});
it("SMS history reads only earlier nights, not later actions or the current ballot", () => {
  const { p, state } = setup();
  put(state, "d3-recipient", { value: p.men[1] });
  const before = smsChoices(work, state, p, config, 3),
    incoming = incomingToPlayer(work, state, p, config, p.men[1], 3);
  put(state, "d21-focus", { target: p.men[1] });
  put(state, "d21-approach", { sceneSignal: -1 });
  put(state, "d21-sms", { value: before[0].text });
  expect(smsChoices(work, state, p, config, 3)).toEqual(before);
  put(state, "d3-recipient", { value: p.ex });
  expect(incomingToPlayer(work, state, p, config, p.men[1], 3)).toBe(incoming);
});
it("saved intentions have distinct effects while current NPC ballots remain simultaneous and independent", () => {
  const { p, state } = setup();
  put(state, "d1-recipient", { value: p.men[1] });
  state.unlocked.push("d1-sms");
  const options = smsChoices(work, state, p, config, 1);
  const soft = JSON.parse(
    packSeasonAnswer(
      work,
      state,
      "d1-sms",
      options.find((o) => o.intent === "flirt")!.text,
    )!,
  );
  const boundary = JSON.parse(
    packSeasonAnswer(
      work,
      state,
      "d1-sms",
      options.find((o) => o.intent === "boundary")!.text,
    )!,
  );
  expect(soft.smsVersion).toBe(2);
  expect(soft.smsOptions).toHaveLength(3);
  expect(soft.votes.filter((v: { from: string }) => v.from !== p.name)).toEqual(
    boundary.votes.filter((v: { from: string }) => v.from !== p.name),
  );
  const baseline = relationships(work, state, p, config, 1)[p.men[1]];
  put(state, "d1-sms", soft);
  const warm = relationships(work, state, p, config, 1)[p.men[1]];
  put(state, "d1-sms", boundary);
  const cool = relationships(work, state, p, config, 1)[p.men[1]];
  expect(warm.affinity - baseline.affinity).toBe(2);
  expect(cool.affinity).toBe(baseline.affinity);
  expect(cool.pressure).toBeLessThanOrEqual(warm.pressure);
  expect(warm.sent).toBe(1);
  expect(relationships(work, state, p, config, 1)[p.men[1]]).toEqual(cool);
});
it("all authored text is brief and eight incoming voices are distinct", () => {
  const book = smsBook(work),
    voices = new Set<string>();
  for (const name of config.men) {
    voices.add(JSON.stringify(book.characters[name].incoming));
    for (const rows of Object.values(book.characters[name].incoming))
      for (const text of rows) {
        expect(text.length).toBeLessThanOrEqual(70);
        expect(text).not.toContain("今天");
      }
  }
  expect(voices.size).toBe(8);
  for (const ex of book.exes)
    for (const rows of Object.values(ex.outgoing))
      for (const { text } of rows)
        expect(
          text.split(/[。！？!?]+/).filter((s) => s.trim()).length,
        ).toBeLessThanOrEqual(2);
});
it("an already delivered letter and its sender choices remain the saved recording", () => {
  const { p, state } = setup();
  put(state, "d1-recipient", { value: p.ex });
  state.unlocked.push("d1-sms");
  const choice = smsChoices(work, state, p, config, 1)[0];
  const packed = packSeasonAnswer(work, state, "d1-sms", choice.text)!;
  state.ui!.kakao!["answer:d1-sms"] = packed;
  const receipt = seasonValues(work, state, p, config).sms1;
  put(state, "d19-focus", { target: p.men[1] });
  put(state, "d19-approach", { sceneSignal: -1 });
  expect(seasonValues(work, state, p, config).sms1).toBe(receipt);
  expect(state.ui!.kakao!["answer:d1-sms"]).toBe(packed);
});

it("even repeated tense encounters keep three fresh outgoing choices through the final night", () => {
  for (const isEx of [true, false]) {
    const { p, state } = setup(),
      target = isEx ? p.ex : p.men[1],
      used = new Set<string>();
    for (let day = 1; day <= 21; day++) {
      put(state, `d${day}-focus`, { target });
      put(state, `d${day}-approach`, {
        sceneId: `tense-${day}`,
        target,
        sceneSignal: -1,
      });
      put(state, `d${day}-recipient`, { value: target });
      const options = smsChoices(work, state, p, config, day);
      expect(options, `${target}/${day}`).toHaveLength(3);
      for (const row of options) expect(used.has(row.text)).toBe(false);
      used.add(options[0].text);
      put(state, `d${day}-sms`, {
        value: options[0].text,
        smsOptions: options.map((row) => row.text),
      });
    }
  }
});
