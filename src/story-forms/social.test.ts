import { it, expect } from "vitest";
import { compileStory } from "../story-engine/compiler";
import { initialRuntime, type Runtime } from "../schema";
import {
  castFor,
  profileConfig,
  saveProfile,
  renderStoryItem,
} from "./profile";
import { packSeasonAnswer, seasonValues } from "./season";
import { firstNightScore } from "./contacts";
import story from "../../stories/template/story.json";
const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function put(state: Runtime, id: string, value: string, index?: number) {
  state.ui!.kakao!["answer:" + id] = JSON.stringify({
    value,
    optionIndex: index,
  });
}
function setup(seed = "social", reason = 0, late = false) {
  const p = {
    ...saveProfile(
      {
        name: "小雨",
        men: config.men.slice(0, 6),
        ex: config.men[0],
        late,
        reason: config.reasons[reason],
        reunion: 50,
        mbti: "INFP",
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
function submit(
  seed: string,
  reason: number,
  late: boolean,
  index: number,
  toX = false,
) {
  const { p, state } = setup(seed, reason, late),
    cast = castFor(p, config),
    focus = toX && !late ? p.ex : cast.presentMen.find((m) => m !== p.ex)!;
  put(state, "d1-focus", focus);
  const offered = JSON.parse(
    seasonValues(work, state, p, config).conversationOptions1,
  );
  put(state, "d1-approach", offered[index], index);
  put(state, "d1-recipient", focus);
  state.unlocked.push("d1-sms");
  const sms = JSON.parse(seasonValues(work, state, p, config).smsOptions1)[0];
  const packed = packSeasonAnswer(work, state, "d1-sms", sms);
  expect(packed).toBeDefined();
  return { p, state, focus, packed: JSON.parse(packed!) };
}
it("an actually receptive first-night conversation wins attention across seeds, backgrounds and both arrival settings", () => {
  for (let reason = 0; reason < 6; reason++)
    for (const late of [false, true])
      for (let n = 0; n < 12; n++) {
        const { p, state, focus, packed } = submit(
          String(n),
          reason,
          late,
          0,
          !late,
        );
        expect(
          packed.votes.find(
            (v: { from: string; to: string }) => v.from === focus,
          ).to,
        ).toBe(p.name);
        expect(
          firstNightScore(work, state, p, config, focus, p.name),
        ).toBeGreaterThan(23);
        expect(
          packed.votes.filter((v: { to: string }) => v.to === p.name).length,
        ).toBeGreaterThan(0);
      }
});
it("changing the outgoing recipient does not force that person to send a message back", () => {
  const { p, state, packed } = submit("independent", 0, false, 0);
  const to = castFor(p, config).presentMen.find(
    (m) =>
      m !== p.ex &&
      m !== JSON.parse(String(state.ui!.kakao!["answer:d1-focus"])).value,
  )!;
  put(state, "d1-recipient", to);
  const sms = JSON.parse(seasonValues(work, state, p, config).smsOptions1)[1];
  const other = JSON.parse(packSeasonAnswer(work, state, "d1-sms", sms)!);
  expect(
    other.votes.filter((v: { from: string }) => v.from !== p.name),
  ).toEqual(packed.votes.filter((v: { from: string }) => v.from !== p.name));
});
it("a pressure-heavy approach loses score instead of getting a guaranteed consolation vote", () => {
  const warm = submit("contrast", 0, false, 0),
    pressure = submit("contrast", 0, false, 1);
  expect(
    firstNightScore(work, warm.state, warm.p, config, warm.focus, warm.p.name) -
      firstNightScore(
        work,
        pressure.state,
        pressure.p,
        config,
        pressure.focus,
        pressure.p.name,
      ),
  ).toBe(19);
});
it("writes six distinct X message sets for each stage, never treating X as a first introduction", () => {
  for (const day of [1, 8, 15]) {
    const sets = new Set();
    for (let reason = 0; reason < 6; reason++) {
      const { p, state } = setup("sms", reason);
      put(state, `d${day}-recipient`, p.ex);
      const opts = JSON.parse(
        seasonValues(work, state, p, config)["smsOptions" + day],
      );
      sets.add(JSON.stringify(opts));
      expect(opts).toHaveLength(3);
      for (const text of opts) {
        expect(text).not.toMatch(/認識你|认识你|希望明天不只是叫得出名字/);
        expect(
          text.split(/[。！？!?]+/).filter((x: string) => x.trim()).length,
        ).toBeLessThanOrEqual(2);
      }
    }
    expect(sets.size).toBe(6);
  }
});
it("keeps saved ballots fixed and does not reveal their senders in the forum", () => {
  const { p, state, packed } = submit("saved", 1, false, 0, true);
  state.ui!.kakao!["answer:d1-sms"] = JSON.stringify(packed);
  const before = seasonValues(work, state, p, config);
  put(state, "d2-focus", p.men[2]);
  expect(JSON.parse(String(state.ui!.kakao!["answer:d1-sms"])).votes).toEqual(
    packed.votes,
  );
  expect(seasonValues(work, state, p, config).forumReceipt1).toBe(
    before.forumReceipt1,
  );
  for (const v of packed.votes)
    if (v.to === p.name) {
      expect(before.forumReceipt1).not.toContain(v.from);
      expect(before.forumReceipt1).not.toContain(v.text);
    }
});
it("gives each episode its own thread and each official clip its own visible discussion", () => {
  const { p, state } = setup();
  const values = seasonValues(work, state, p, config);
  const roots = work.data.safari.filter((i) => i.meta.episodeRoot === "true");
  expect(new Set(roots.map((i) => i.body)).size).toBe(roots.length);
  for (const root of roots)
    expect(root.body.match(/\d+樓｜/g)?.length).toBeGreaterThanOrEqual(20);
  const clips = work.data.twitter.filter(
    (i) => i.meta.production === "true" && i.id !== "d0-meeting",
  );
  expect(new Set(clips.map((i) => JSON.stringify(i.comments))).size).toBe(
    clips.length,
  );
  for (const clip of clips) {
    expect(clip.likes).toBeGreaterThanOrEqual(42000);
    expect(Number(clip.meta.reposts)).toBeGreaterThanOrEqual(8600);
    expect(clip.comments.length).toBeGreaterThanOrEqual(8);
    const view = renderStoryItem(clip, values);
    expect(view.comments.join("")).not.toMatch(/\{\{/);
  }
});
