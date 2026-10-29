import { expect, it } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime } from "../schema";
import { profileConfig, saveProfile } from "./profile";
import { characterBook, presentedBefore } from "./characters";
import { momentFor, packMoment } from "./encounters";
import { incomingToPlayer, otherSms, smsChoices } from "./messages";
import {
  commitmentWords,
  relationships,
  finalConsent,
  playerReunionConfirmed,
  relationshipReadiness,
  repairOptions,
} from "./relationships";
import {
  nightlyChoices,
  packSeasonAnswer,
  residentCast,
  seasonValues,
} from "./season";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(seed = "continuity") {
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
function warmRoute(seed = "consistent") {
  const { p, state } = setup(seed);
  for (let d = 1; d <= 21; d++) {
    put(state, `d${d}-focus`, { value: p.ex });
    const value = JSON.parse(
      work.data.kakao.find((i) => i.id === `d${d}-approach`)!.meta
        .legacyOptions,
    )[0];
    put(state, `d${d}-approach`, { value, optionIndex: 0 });
  }
  for (const d of [7, 14, 19])
    put(state, `d${d}-repair`, {
      value: repairOptions(work, p, config, d)[0],
      optionIndex: 0,
    });
  put(state, "d21-chat1", {
    value: repairOptions(work, p, config, 21)[0],
    optionIndex: 0,
  });
  const chat2 = work.data.kakao.find((i) => i.id === "d21-chat2")!;
  put(state, "d21-chat2", {
    value: JSON.parse(chat2.meta.options)[0],
    optionIndex: 0,
  });
  return { p, state };
}
it("records both shown men and the woman, not just the person the player selected", () => {
  for (const branch of [0, 1, 2]) {
    const { p, state } = setup(String(branch)),
      seen = new Set<string>();
    for (let day = 1; day <= 21; day++) {
      const m = momentFor(work, state, p, config, day)!;
      for (const id of m.scene.presentedScenes || [m.scene.id]) {
        expect(seen.has(id), `${day}/${id}`).toBe(false);
        seen.add(id);
      }
      const focus = packMoment(
        work,
        state,
        p,
        config,
        day,
        "focus",
        m.options[branch],
      )!;
      expect(focus.presentedScenes?.length).toBeGreaterThan(0);
      put(state, `d${day}-focus`, focus);
      const chosen = momentFor(work, state, p, config, day)!;
      put(
        state,
        `d${day}-approach`,
        packMoment(
          work,
          state,
          p,
          config,
          day,
          "approach",
          chosen.choices[0].line,
        )!,
      );
      for (const id of focus.presentedScenes!)
        expect(presentedBefore(work, state, day + 1, p.ex).has(id)).toBe(true);
    }
  }
});
it("restores old cast records while not replaying their unchosen supporting character", () => {
  const { p, state } = setup(),
    first = momentFor(work, state, p, config, 1)!;
  const focus = packMoment(
    work,
    state,
    p,
    config,
    1,
    "focus",
    first.options[0],
  )!;
  const legacy = { ...focus };
  delete legacy.presentedScenes;
  put(state, "d1-focus", legacy);
  const before = momentFor(work, state, p, config, 1)!.opening;
  const seen = presentedBefore(work, state, 2, p.ex),
    book = characterBook(work);
  const b = book.men.find((m) => m.name === focus.cast!.b)!.scenes[0];
  expect(seen.has(b.id)).toBe(true);
  put(state, "d20-focus", { value: p.ex });
  expect(momentFor(work, state, p, config, 1)!.opening).toBe(before);
});
it("keeps every real nightly batch unique and never re-sends a previously seen letter to the player", () => {
  const { p, state } = setup("all-batches"),
    received = new Set<string>();
  for (let day = 1; day <= 21; day++) {
    const cast = residentCast(p, config, day);
    put(state, `d${day}-recipient`, { value: cast.men[0] });
    state.unlocked.push(`d${day}-sms`);
    const option = smsChoices(work, state, p, config, day)[0],
      packed = packSeasonAnswer(work, state, `d${day}-sms`, option.text)!;
    expect(packed).toBeDefined();
    const record = JSON.parse(packed);
    expect(
      new Set(record.votes.map((v: { text: string }) => v.text)).size,
    ).toBe(record.votes.length);
    for (const vote of record.votes)
      if (vote.to === p.name) {
        expect(received.has(vote.text), `${day}/${vote.text}`).toBe(false);
        received.add(vote.text);
      }
    state.ui!.kakao![`answer:d${day}-sms`] = packed;
  }
});
it("has enough capacity even when all six men keep writing through 21 nights in the same tone", () => {
  const { p, state } = setup("capacity"),
    received = new Set<string>();
  for (let day = 1; day <= 21; day++) {
    const cast = residentCast(p, config, day),
      reserved = new Set<string>(),
      votes: { from: string; to: string; text: string }[] = [];
    for (const from of cast.men) {
      const text = incomingToPlayer(
        work,
        state,
        p,
        config,
        from,
        day,
        reserved,
      );
      expect(reserved.has(text)).toBe(false);
      expect(received.has(text), `${day}/${from}/${text}`).toBe(false);
      reserved.add(text);
      received.add(text);
      votes.push({ from, to: p.name, text });
    }
    for (const from of cast.women.filter((w) => w !== p.name)) {
      const text = otherSms(
        work,
        state,
        p,
        config,
        from,
        cast.men[0],
        day,
        reserved,
      );
      expect(reserved.has(text)).toBe(false);
      reserved.add(text);
      votes.push({ from, to: cast.men[0], text });
    }
    put(state, `d${day}-sms`, { value: `own-${day}`, votes });
  }
});
it("does not promise reunion at the last conversation when the same night's NPC is not ready", () => {
  const { p, state } = setup("legacy-attached");
  for (let day = 1; day < 21; day++)
    put(state, `d${day}-sms`, {
      value: `own-${day}`,
      votes: [{ from: p.ex, to: p.name, text: `legacy-${day}` }],
    });
  state.unlocked.push("d21-chat1");
  const packed = packSeasonAnswer(
    work,
    state,
    "d21-chat1",
    repairOptions(work, p, config, 21)[0],
  )!;
  expect(packed).toBeDefined();
  state.ui!.kakao!["answer:d21-chat1"] = packed;
  const ready = relationshipReadiness(work, state, p, config, p.ex, 21);
  expect(ready.ready).toBe(false);
  const words = commitmentWords(work, p, config, ready.code)!;
  expect(seasonValues(work, state, p, config).finalTalkReply).toContain(
    words.talk,
  );
  expect(seasonValues(work, state, p, config).finalTalkReply).not.toContain(
    "回去以後，你還想跟我試嗎",
  );
  expect(words.sms).toContain(
    incomingToPlayer(work, state, p, config, p.ex, 21),
  );
});
it("a repaired mutually confirmed relationship that keeps choosing the player does not fail at the last screen", () => {
  let found = false;
  for (const seed of ["consistent", "loyal", "0", "1", "2"]) {
    const { p, state } = warmRoute(seed);
    let continuous = true;
    for (let day = 1; day <= 21; day++) {
      const plan = nightlyChoices(work, p, config, state, day);
      if (plan.recipients[p.ex] !== p.name) continuous = false;
      put(state, `d${day}-sms`, {
        value: `own-${day}`,
        votes: Object.entries(plan.recipients).map(([from, to]) => ({
          from,
          to,
          text: `${day}-${from}`,
        })),
      });
    }
    if (!continuous) continue;
    found = true;
    expect(relationshipReadiness(work, state, p, config, p.ex, 21).ready).toBe(
      true,
    );
    expect(playerReunionConfirmed(work, state)).toBe(true);
    expect(finalConsent(work, state, p, config, p.ex).success).toBe(true);
    break;
  }
  expect(found).toBe(true);
});
it("snapshots the last conversation instead of rewriting it after a later house interaction", () => {
  const { p, state } = warmRoute();
  delete state.ui!.kakao!["answer:d21-chat1"];
  state.unlocked.push("d21-chat1");
  const packed = packSeasonAnswer(
    work,
    state,
    "d21-chat1",
    repairOptions(work, p, config, 21)[0],
  )!;
  state.ui!.kakao!["answer:d21-chat1"] = packed;
  const before = seasonValues(work, state, p, config).finalTalkReply;
  put(state, "d21-focus", { value: p.men[2] });
  expect(seasonValues(work, state, p, config).finalTalkReply).toBe(before);
});
it("does not label the player's own pause as an NPC rejection", () => {
  const { p, state } = warmRoute();
  const chat2 = work.data.kakao.find((i) => i.id === "d21-chat2")!;
  put(state, "d21-chat2", {
    value: JSON.parse(chat2.meta.options)[1],
    optionIndex: 1,
  });
  state.variables.finalRoute = "reunion";
  expect(finalConsent(work, state, p, config, p.ex).code).toBe("player");
  expect(seasonValues(work, state, p, config).finalResult).toContain(
    "這不等於對方拒絕了你",
  );
  expect(seasonValues(work, state, p, config).finalResult).not.toContain(
    "對方沒有接受",
  );
});

it("counts actual formal X meetings and the final chat once instead of inventing a lack of contact", () => {
  const { p, state } = setup();
  state.read.push("d0-meeting");
  for (const d of [7, 14, 19])
    put(state, `d${d}-repair`, {
      value: repairOptions(work, p, config, d)[0],
      optionIndex: 0,
    });
  put(state, "d21-chat1", {
    value: repairOptions(work, p, config, 21)[0],
    optionIndex: 0,
  });
  put(state, "d21-chat2", {
    value: JSON.parse(
      work.data.kakao.find((i) => i.id === "d21-chat2")!.meta.options,
    )[0],
    optionIndex: 0,
  });
  const r = relationships(work, state, p, config, 21, false)[p.ex];
  expect(r.meetings).toBe(5);
  expect(r.lastDay).toBe(21);
  expect(relationshipReadiness(work, state, p, config, p.ex, 21).code).not.toBe(
    "contact",
  );
  expect(relationships(work, state, p, config, 21, false)[p.ex]).toEqual(r);
});

it("the player's explicit final choice can supersede an earlier request for more time", () => {
  const { p, state } = warmRoute();
  const chat = work.data.kakao.find((i) => i.id === "d21-chat2")!;
  put(state, "d21-chat2", {
    value: JSON.parse(chat.meta.options)[1],
    optionIndex: 1,
  });
  expect(finalConsent(work, state, p, config, p.ex).code).toBe("player");
  state.variables.finalRoute = "reunion";
  state.completed.push("final-reunion");
  expect(finalConsent(work, state, p, config, p.ex).success).toBe(true);
});
