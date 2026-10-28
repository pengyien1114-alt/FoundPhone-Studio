import type { Runtime, Work } from "../schema";
import { castFor, type Profile, type ProfileConfig } from "./profile";
import { seeded, selected, type Relationship } from "./relationships";
export type MomentChoice = {
  line: string;
  result: string;
  effect: Partial<Relationship>;
  signal: number;
};
type Branch = {
  label: string;
  target: "a" | "b" | "";
  lead: string;
  prompt: string;
  choices: MomentChoice[];
  sms?: string[];
  incoming?: string[];
};
export type HouseMoment = {
  id: string;
  phase: number;
  title: string;
  intro: string;
  branches: Branch[];
  comments: string[];
  prompt?: string;
  sms?: string[];
  incoming?: string[];
  voices?: Record<string, string>;
};
export type MomentAnswer = {
  value: string;
  optionIndex: number;
  sceneId: string;
  target: string;
  sceneBranch: number;
  sceneEffect: Partial<Relationship>;
  sceneSignal: number;
  sceneMeeting: boolean;
  exBeat?: boolean;
};
export function momentRecord(
  state: Runtime,
  id: string,
): MomentAnswer | undefined {
  try {
    return (
      JSON.parse(String(state.ui?.kakao?.["answer:" + id] || "null")) ||
      undefined
    );
  } catch {
    return undefined;
  }
}
const libraries = new WeakMap<Work, HouseMoment[]>();
const pastLibraries = new WeakMap<
  Work,
  { intro: string; prompt: string; choices: MomentChoice[] }[][]
>();
function phase(day: number) {
  return day < 7 ? 0 : day < 14 ? 1 : 2;
}
export function houseMoments(work: Work): HouseMoment[] {
  const cached = libraries.get(work);
  if (cached) return cached;
  try {
    const parsed = JSON.parse(
      work.data.notes.find((i) => i.id === "house-moments")?.body || "[]",
    );
    libraries.set(work, parsed);
    return parsed;
  } catch {
    return [];
  }
}
// Work is immutable. Draw once from a shuffled phase deck, using only the show's seed and earlier days.
export function momentFor(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  day: number,
) {
  const stage = phase(day),
    library = houseMoments(work),
    deck = library
      .filter((i) => i.phase === stage)
      .sort(
        (a, b) =>
          seeded(`${p.seed}|moment|${a.id}`) -
          seeded(`${p.seed}|moment|${b.id}`),
      ),
    saved = momentRecord(state, `d${day}-focus`),
    scene =
      library.find((i) => i.id === saved?.sceneId) ||
      deck[(day - [1, 7, 14][stage]) % Math.max(1, deck.length)];
  if (!scene) return undefined;
  const cast = castFor(p, config),
    men = day >= 10 ? p.men : cast.presentMen,
    women = day >= 3 ? config.women : cast.presentWomen,
    shuffled = [...men].sort(
      (a, b) =>
        seeded(`${p.seed}|cast|${stage}|${a}`) -
        seeded(`${p.seed}|cast|${stage}|${b}`),
    ),
    a = shuffled[(day - 1) % shuffled.length];
  const recent: Record<string, number> = {};
  for (let d = 1; d < day; d++) {
    const recipient = selected(state, `d${d}-recipient`),
      focus = selected(state, `d${d}-focus`);
    if (recipient) recent[recipient] = (recent[recipient] || 0) + 1;
    if (focus) recent[focus] = (recent[focus] || 0) + 1;
  }
  const preferred = [...men]
    .filter((m) => m !== a)
    .sort(
      (x, y) =>
        (recent[y] || 0) - (recent[x] || 0) ||
        seeded(`${p.seed}|nearby|${day}|${x}`) -
          seeded(`${p.seed}|nearby|${day}|${y}`),
    );
  const b =
      day % 3 !== 0
        ? preferred[0]
        : shuffled[(shuffled.indexOf(a) + 1) % shuffled.length],
    woman =
      women[
        (day + Math.floor(seeded(`${p.seed}|woman|${day}`) * women.length)) %
          women.length
      ],
    other = men.find((m) => m !== a && m !== b)!;
  const names = {
    a,
    b,
    woman,
    other,
    player: p.name,
    aLine: scene.voices?.[a] || "",
    bLine: scene.voices?.[b] || "",
  };
  const render = (s: string) =>
    s.replace(
      /\{\{(a|b|woman|other|player|aLine|bLine)\}\}/g,
      (_, key: keyof typeof names) => names[key],
    );
  const branchIndex = saved?.sceneId ? saved.sceneBranch : -1,
    branch = scene.branches[branchIndex] || scene.branches[0],
    target = saved?.sceneId
      ? saved.target
      : branch.target
        ? names[branch.target]
        : "";
  const old = saved && !saved.sceneId;
  let beat:
    { intro: string; prompt: string; choices: MomentChoice[] } | undefined;
  if (target === p.ex && saved?.sceneId) {
    const seen = Array.from({ length: day - 1 }, (_, i) => i + 1).some(
      (d) =>
        phase(d) === stage && momentRecord(state, `d${d}-approach`)?.exBeat,
    );
    if (!seen) {
      try {
        const library =
          pastLibraries.get(work) ||
          JSON.parse(
            work.data.notes.find((i) => i.id === "unfinished-past")?.body ||
              "[]",
          );
        pastLibraries.set(work, library);
        beat = library[config.reasons.indexOf(p.reason)]?.[stage];
      } catch {
        /* A blank story has no past. */
      }
    }
  }
  const source = beat?.choices || branch.choices;
  const order =
    day === 1
      ? source.map((_, i) => i)
      : source
          .map((_, i) => i)
          .sort(
            (x, y) =>
              seeded(`${p.seed}|reply|${scene.id}|${branchIndex}|${x}|choice`) -
              seeded(`${p.seed}|reply|${scene.id}|${branchIndex}|${y}|choice`),
          );
  const choices = order.map((i) => ({
    ...source[i],
    line: render(source[i].line),
    result: render(source[i].result),
  }));
  return {
    scene,
    saved,
    old,
    names,
    render,
    branch,
    branchIndex,
    target,
    beat,
    choices,
    opening: render(scene.intro),
    options: scene.branches.map((i) => render(i.label)),
    lead: render(branch.lead) + (beat ? "\n\n" + render(beat.intro) : ""),
    prompt: render(beat?.prompt || branch.prompt),
  };
}
export function packMoment(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  day: number,
  turn: "focus" | "approach",
  value: string,
): MomentAnswer | undefined {
  const m = momentFor(work, state, p, config, day);
  if (!m || m.old) return undefined;
  const options = turn === "focus" ? m.options : m.choices.map((c) => c.line),
    index = options.indexOf(value);
  if (index < 0) return undefined;
  const branch = turn === "focus" ? m.scene.branches[index] : m.branch,
    target =
      turn === "focus"
        ? branch.target
          ? m.names[branch.target]
          : ""
        : m.target,
    choice = m.choices[index];
  return {
    value,
    optionIndex: index,
    sceneId: m.scene.id,
    target,
    sceneBranch: turn === "focus" ? index : m.branchIndex,
    sceneEffect:
      turn === "focus"
        ? target
          ? { affinity: 1 }
          : {}
        : target
          ? choice.effect
          : {},
    sceneSignal: turn === "focus" ? 0 : choice.signal,
    sceneMeeting: turn === "approach" && !!target,
    ...(turn === "approach" && m.beat ? { exBeat: true } : {}),
  };
}
export function encounterValues(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (let day = 1; day <= 21; day++) {
    const m = momentFor(work, state, p, config, day);
    if (!m || m.old) continue;
    values[`encounter${day}`] = `【${m.scene.title}】\n\n${m.opening}`;
    values[`encounterChoices${day}`] = JSON.stringify(m.options);
    values[`encounterQuestion${day}`] = m.render(
      m.scene.prompt || m.scene.title,
    );
    values[`conversationOptions${day}`] = JSON.stringify(
      m.choices.map((c) => c.line),
    );
    values[`conversationQuestion${day}`] = m.saved?.sceneId
      ? `${m.lead}\n\n${m.prompt}`
      : m.prompt;
    const comments = [
      ...m.scene.comments,
      `回放組：${m.scene.title}這段我先存著，等後面再看誰還會記得。`,
      `原PO：這裡先記到 ${m.scene.title}，晚上的短信另外看，不先替誰填答案。`,
    ].map(m.render);
    comments.forEach((text, index) => {
      values[`momentComment${day}_${index}`] = text;
    });
    const response = momentRecord(state, `d${day}-approach`);
    if (m.saved?.sceneId && response?.sceneId) {
      const reply = m.choices[response.optionIndex];
      const spoken = response.value.replace(/^[「“]/, "").replace(/[」”]$/, "");
      values[`interaction${day}`] =
        `${m.lead}\n\n你說：「${spoken}」\n\n${reply?.result || ""}`;
      values[`conversationVisibility${day}`] =
        m.target === p.ex && day < 14 ? "player" : "public";
      const extra = [
        m.branchIndex === 2
          ? `${p.name} 跟 ${m.names.woman} 那邊我也想多看一點，別一沒配對就切走。`
          : `${p.name} 真的過去以後，${m.target} 那個反應跟剛才不一樣了。`,
        response.sceneSignal < 0
          ? "我剛準備嗑，這句一出來我整個坐直；酸是真的，說太重也是真的。"
          : response.sceneSignal > 0
            ? "我本來想說這有什麼，結果笑著看完才發現自己在重播。"
            : "不是每次都要講出很厲害的話，有時候就先在旁邊也可以吧。",
        ">>29 但鏡頭也會挑啊，我先看他們之後怎麼相處。",
        `${m.names.woman} 和 ${m.names.other} 那邊別剪成陪襯，我還想看他們後來吵完沒有。`,
        `回放到「${m.scene.title}」這裡，原本沒注意的小動作突然全看得見。`,
        ">>32 同意，但我不想每個動作都拿來替誰宣布關係，讓我先笑一下。",
        "原PO：今晚這一段接上了，下面還有短信，別把白天的話直接算成同一張票。",
        "我本來只想看熱鬧，結果又因為一句很普通的話停住了。",
      ];
      values[`momentForum${day}`] =
        m.target === p.ex && day < 14
          ? ""
          : [...m.scene.comments, ...extra]
              .map(
                (s, i) =>
                  `${21 + i}樓｜${["ㅇㅇ", "回放組", "今天不站穩", "原PO"][i % 4]}\n${m.render(s)}`,
              )
              .join("\n\n");
      values[`momentMessage${day}`] = m.target
        ? m.render(m.scene.comments[0])
        : "";
    }
  }
  return values;
}
