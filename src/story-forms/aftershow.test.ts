import { describe, expect, it } from "vitest";
import story from "../../stories/template/story.json";
import { compileStory } from "../story-engine/compiler";
import { dispatch, visible } from "../engine";
import { initialRuntime, type Runtime } from "../schema";
import { profileConfig, renderStoryItem, saveProfile } from "./profile";
import {
  aftershowOutcome,
  aftershowValues,
  packAftershowPost,
} from "./aftershow";
import { repairOptions } from "./relationships";

const { work } = compileStory(story),
  config = work.data.notes.map(profileConfig).find(Boolean)!;
function setup(route = "single", ready = false) {
  const p = saveProfile(
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
  );
  let state = initialRuntime(work);
  state.ui = { notes: { profile: JSON.stringify(p) }, kakao: {} };
  state.variables.finalRoute = route;
  const put = (id: string, value: string) => {
    state.ui!.kakao!["answer:" + id] = JSON.stringify({ value });
  };
  const target = route === "new" ? p.men[1] : p.ex;
  put("final-new-target", p.men[1]);
  if (ready) {
    for (let d = 1; d <= 21; d++) {
      put(`d${d}-focus`, target);
      put(
        `d${d}-approach`,
        JSON.parse(
          work.data.kakao.find((i) => i.id === `d${d}-approach`)!.meta
            .legacyOptions,
        )[0],
      );
    }
    for (const d of [7, 14, 19])
      put(`d${d}-repair`, repairOptions(work, p, config)[0]);
    put("d21-chat1", repairOptions(work, p, config)[0]);
    put(
      "d21-chat2",
      JSON.parse(
        work.data.kakao.find((i) => i.id === "d21-chat2")!.meta.options,
      )[0],
    );
    state.completed.push(route === "new" ? "final-new" : "final-reunion");
  }
  state.unlocked.push("final-result");
  state = dispatch(work, state, "read", "final-result");
  state = dispatch(work, state, "variable", "ui:kakao:answer:finish-season");
  return { p, state, facts: { date2: p.men[2], travelPartner: p.men[3] } };
}
function publish(
  state: Runtime,
  p: ReturnType<typeof setup>["p"],
  facts: Record<string, string>,
  index = 0,
) {
  const values = aftershowValues(work, state, p, config, facts);
  const option = JSON.parse(values.afterIgOptions)[index];
  const packed = packAftershowPost(
    work,
    state,
    "after-ig-compose",
    option,
    p,
    config,
    facts,
  );
  expect(packed).toBeDefined();
  return dispatch(
    work,
    {
      ...state,
      ui: { ...state.ui, instagram: { "answer:after-ig-compose": packed! } },
    },
    "variable",
    "ui:instagram:answer:after-ig-compose",
  );
}
describe("post-season publications follow the actual mutual outcome", () => {
  for (const [route, ready, outcome] of [
    ["single", false, "single"],
    ["reunion", true, "reunion"],
    ["new", true, "new"],
    ["reunion", false, "unreturnedReunion"],
    ["new", false, "unreturnedNew"],
  ] as const) {
    it(`${outcome}: authored captions, distinct fans and truthful public topics`, () => {
      const { p, state, facts } = setup(route, ready);
      expect(aftershowOutcome(work, state, p, config)).toBe(outcome);
      const values = aftershowValues(work, state, p, config, facts);
      const options = JSON.parse(values.afterIgOptions);
      expect(new Set(options).size).toBe(3);
      const firstTopic = renderStoryItem(work.data.weibo[0], values);
      expect(firstTopic.title).toContain(p.name);
      if (outcome === "unreturnedReunion")
        expect(firstTopic.title).toContain("沒有雙向復合");
      if (outcome === "unreturnedNew")
        expect(firstTopic.title).toContain("表白未雙向");
      if (outcome === "single") expect(firstTopic.title).toContain("選擇單身");
      const comments: string[][] = [];
      for (let index = 0; index < 3; index++) {
        const next = publish(state, p, facts, index);
        const projection = aftershowValues(work, next, p, config, facts);
        const post = renderStoryItem(
          work.data.instagram.find((i) => i.id === "after-ig-post")!,
          { ...facts, player: p.name, ...projection },
        );
        expect(post.body).toBe(options[index]);
        expect(post.comments).toHaveLength(16);
        expect(new Set(post.comments).size).toBe(16);
        expect(post.comments.join(" ")).toMatch(/回覆 @/);
        expect(post.comments.join(" ")).not.toMatch(
          /\{\{|affinity|pressure|hiddenAffection/,
        );
        expect(post.likes).toBeGreaterThan(100000);
        expect(post.sender).toBe(p.name);
        expect(next.hidden).toContain("after-ig-compose");
        expect(next.unlocked).toContain("after-hot-7");
        expect(next.endings).toEqual(state.endings);
        const igTopic = renderStoryItem(work.data.weibo[6], projection);
        expect(igTopic.body).toContain(options[index]);
        comments.push(post.comments);
      }
      expect(comments[0]).not.toEqual(comments[1]);
      expect(comments[1]).not.toEqual(comments[2]);
      const allComments = work.data.weibo
        .slice(0, 6)
        .flatMap((i) => renderStoryItem(i, values).comments);
      expect(new Set(allComments).size).toBe(48);
    });
  }
});
it("opens six topics only after the final result and the IG update topic only after publishing", () => {
  const initial = initialRuntime(work);
  for (const app of ["instagram", "weibo"]) {
    const before = dispatch(work, initial, "openApp", app);
    expect(work.data[app].some((i) => visible(i, before))).toBe(false);
  }
  const { state } = setup();
  expect(work.data.weibo.filter((i) => visible(i, state))).toHaveLength(6);
  expect(
    visible(
      work.data.instagram.find((i) => i.id === "after-ig-post")!,
      state,
    ),
  ).toBe(false);
});
it("rejects locked, arbitrary, early and duplicate publications without changing the ending", () => {
  const { p, state, facts } = setup();
  const option = JSON.parse(
    aftershowValues(work, state, p, config, facts).afterIgOptions,
  )[0];
  expect(
    packAftershowPost(
      work,
      { ...state, endings: [] },
      "after-ig-compose",
      option,
      p,
      config,
      facts,
    ),
  ).toBeUndefined();
  expect(
    packAftershowPost(
      work,
      state,
      "after-ig-compose",
      "一段自己輸入的文字",
      p,
      config,
      facts,
    ),
  ).toBeUndefined();
  const next = publish(state, p, facts);
  expect(
    packAftershowPost(work, next, "after-ig-compose", option, p, config, facts),
  ).toBeUndefined();
  expect(
    packAftershowPost(work, state, "after-ig-post", option, p, config, facts),
  ).toBeUndefined();
});
it("old finished saves unlock the extras on opening the apps without replaying the final choice", () => {
  const { state } = setup();
  state.unlocked = state.unlocked.filter((id) => !id.startsWith("after-"));
  const previousEnding = [...state.endings];
  let resumed = dispatch(work, state, "openApp", "instagram");
  resumed = dispatch(work, resumed, "openApp", "weibo");
  expect(resumed.unlocked).toContain("after-ig-compose");
  expect(work.data.weibo.filter((i) => visible(i, resumed))).toHaveLength(6);
  expect(resumed.endings).toEqual(previousEnding);
});
it("keeps the published words and comments through refresh and later projections", () => {
  const { p, state, facts } = setup("new", true);
  const posted = publish(state, p, facts);
  const first = aftershowValues(work, posted, p, config, facts);
  const saved = JSON.parse(JSON.stringify(posted));
  saved.variables.finalRoute = "single";
  const reloaded = aftershowValues(work, saved, p, config, facts);
  expect(reloaded.afterIgCaption).toBe(first.afterIgCaption);
  expect(reloaded.afterIgPhoto).toBe(first.afterIgPhoto);
  for (let n = 0; n < 16; n++)
    expect(reloaded["afterIgComment" + n]).toBe(first["afterIgComment" + n]);
});
