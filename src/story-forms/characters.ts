import { savedAnswer } from "./answers";
import type { Work, Runtime } from "../schema";
import type { Profile, ProfileConfig } from "./profile";
import type { MomentChoice, HouseMoment } from "./encounters";
import { publicPartner, type Relationship } from "./relationships";

export type Recall = {
  id: string;
  line: string;
  prompt: string;
  choices: MomentChoice[];
};
export type CharacterScene = {
  id: string;
  phase: number;
  title: string;
  intro: string;
  action: string;
  lead: string;
  prompt: string;
  choices: MomentChoice[];
  comments: string[];
  sms: string[];
  incoming: string[];
};
export type CharacterDate = {
  opening: string;
  questionA: string;
  choicesA: MomentChoice[];
  middle: string | string[];
  questionB: string | string[];
  choicesB: MomentChoice[];
  ending: string;
};
export type Character = {
  name: string;
  scenes: CharacterScene[];
  dates: Record<string, CharacterDate>;
  exVoice: string[];
  reactions: string[];
  memory: Recall[];
  distantLate?: CharacterScene;
};
type CharacterBook = {
  men: Character[];
  women: {
    name: string;
    beats: string[];
    action: string;
    lead: string;
    prompt: string;
    choices: MomentChoice[];
  }[];
  publicMoments?: { scene: string; message: string; alternate?: string }[];
};
const books = new WeakMap<Work, CharacterBook>();
export function characterBook(work: Work): CharacterBook {
  const cached = books.get(work);
  if (cached) return cached;
  try {
    const book = JSON.parse(
      work.data.notes.find((i) => i.id === "character-stories")?.body || "null",
    );
    if (book?.men && book?.women) {
      books.set(work, book);
      return book;
    }
  } catch {
    /* Other phone stories have no character routes. */
  }
  return { men: [], women: [] };
}
export function characterFor(work: Work, name: string) {
  return characterBook(work).men.find((c) => c.name === name);
}
export function readAnswer(
  state: Runtime,
  id: string,
): Record<string, unknown> | undefined {
  return savedAnswer<Record<string, unknown>>(state, id);
}
export function textFor(text: string, names: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (all, key) => names[key] ?? all);
}
export function recallFor(
  work: Work,
  state: Runtime,
  name: string,
  day: number,
) {
  const character = characterFor(work, name);
  if (!character) return undefined;
  const heard = new Set<string>();
  for (let d = 1; d < day; d++) {
    const a = readAnswer(state, `d${d}-approach`);
    if (typeof a?.recallId === "string") heard.add(a.recallId);
  }
  // Only recall something actually said to this person, with at least one full day between scenes.
  for (let d = day - 2; d >= 1; d--) {
    const a = readAnswer(state, `d${d}-approach`);
    if (a?.target !== name || !a.memoryKey || heard.has(String(a.memoryKey)))
      continue;
    const entry = character.memory.find((m) => m.id === a.memoryKey);
    if (entry) return { ...entry, day: d, said: String(a.value || "") };
  }
  return undefined;
}
export function characterScene(
  work: Work,
  name: string,
  phase: number,
  state?: Runtime,
  day = 21,
  ex = "",
) {
  const person = characterFor(work, name);
  if (phase === 2 && state && name !== ex) {
    let contact = 0;
    for (let d = 1; d < day; d++) {
      const focus = readAnswer(state, `d${d}-focus`);
      const talk = readAnswer(state, `d${d}-approach`);
      const effect = talk?.sceneEffect as Partial<Relationship> | undefined;
      if (
        (focus?.target || focus?.value) === name &&
        talk &&
        (effect
          ? (effect.affinity || 0) > 0 && (effect.trust || 0) >= 2
          : talk.optionIndex !== 1)
      )
        contact++;
      const date = readAnswer(state, `d${d}-date-choice-a`);
      const dateEffect = date?.sceneEffect as Partial<Relationship> | undefined;
      if (
        date?.dateTarget === name &&
        (dateEffect
          ? (dateEffect.affinity || 0) > 0 && (dateEffect.trust || 0) >= 0
          : date.optionIndex !== 1)
      )
        contact++;
    }
    if (contact < 2 && person?.distantLate) return person.distantLate;
  }
  return person?.scenes.find((s) => s.phase === phase);
}
export function presentedBefore(
  work: Work,
  state: Runtime,
  day: number,
  ex: string,
) {
  const seen = new Set<string>();
  for (let d = 1; d < day; d++) {
    const saved = readAnswer(state, `d${d}-focus`),
      reply = readAnswer(state, `d${d}-approach`);
    if (typeof saved?.sceneId === "string") seen.add(saved.sceneId);
    if (typeof reply?.actorScene === "string") seen.add(reply.actorScene);
    if (Array.isArray(saved?.presentedScenes))
      for (const id of saved.presentedScenes)
        if (typeof id === "string") seen.add(id);
    // Recover the two unchosen on-screen beats from older recordings too.
    const cast = saved?.cast as
      { a: string; b: string; woman: string } | undefined;
    const stage = d < 7 ? 0 : d < 14 ? 1 : 2;
    if (
      cast &&
      !Array.isArray(saved?.presentedScenes) &&
      characterScene(work, cast.a, stage, state, d, ex)?.id === saved?.sceneId
    ) {
      const b = characterScene(work, cast.b, stage, state, d, ex);
      if (b) seen.add(b.id);
      seen.add(`woman:${cast.woman}:${Math.min(2, Math.floor((d - 1) / 7))}`);
    }
  }
  return seen;
}
export function characterMoment(
  work: Work,
  state: Runtime,
  p: Profile,
  _config: ProfileConfig,
  day: number,
  names: { a: string; b: string; woman: string; other: string },
  base: HouseMoment,
): HouseMoment | undefined {
  const phase = day < 7 ? 0 : day < 14 ? 1 : 2;
  const a = characterScene(work, names.a, phase, state, day, p.ex),
    b = characterScene(work, names.b, phase, state, day, p.ex);
  const woman = characterBook(work).women.find((c) => c.name === names.woman);
  if (!a || !b || !woman) return undefined;
  const used = presentedBefore(work, state, day, p.ex);
  const saved = readAnswer(state, `d${day}-focus`);
  if (saved?.sceneId && saved.sceneId !== a.id) return undefined;
  const presented = [a.id, b.id, `woman:${names.woman}:${phase}`];
  if (!saved?.sceneId && presented.some((id) => used.has(id))) return undefined;
  const beatPhase =
    saved?.sceneId && !Array.isArray(saved.presentedScenes)
      ? Math.min(2, Math.floor((day - 1) / 7))
      : phase;
  const wBeat = woman.beats[beatPhase];
  const peer = publicPartner(p, _config, names.woman);
  const render = (s: string) =>
    textFor(s, { ...names, other: peer, man: names.a, player: p.name });
  const branch = (scene: CharacterScene, target: "a" | "b") => {
    const subst = (s: string) =>
      textFor(s, {
        man: names[target],
        woman: names.woman,
        other: names.other,
        player: p.name,
      });
    return {
      label: subst(scene.action),
      target,
      lead: subst(scene.lead),
      prompt: subst(scene.prompt),
      choices: scene.choices.map((c) => ({
        ...c,
        line: subst(c.line),
        result: subst(c.result),
      })),
      sms: scene.sms.map(subst),
      incoming: scene.incoming.map(subst),
    };
  };
  return {
    ...base,
    id: a.id,
    phase,
    title: a.title,
    presentedScenes: presented,
    peer,
    intro:
      render(a.intro) +
      "\n\n" +
      textFor(b.intro, { ...names, man: names.b }) +
      "\n\n" +
      render(wBeat),
    branches: [
      branch(a, "a"),
      branch(b, "b"),
      {
        label: render(woman.action),
        target: "",
        lead: render(woman.lead),
        prompt: render(woman.prompt),
        choices: woman.choices.map((c) => ({
          ...c,
          line: render(c.line),
          result: render(c.result),
        })),
      },
    ],
    comments: a.comments.map(render),
  };
}
export type CharacterDateAnswer = {
  value: string;
  optionIndex: number;
  dateTarget: string;
  sceneEffect: Partial<Relationship>;
  characterDate: true;
  dateReply: string;
  dateMiddle: string;
  dateQuestion: string;
  dateVersion: 2;
};
export function dateRoute(
  work: Work,
  state: Runtime,
  day: number,
  target: string,
  ex: string,
) {
  const route = characterFor(work, target)?.dates[String(day)];
  if (!route) return undefined;
  const saved = readAnswer(state, `d${day}-date-choice-a`);
  // Continue old date recordings with their original questions and effects.
  if (saved && saved.characterDate !== true) return undefined;
  const render = (s: string) => textFor(s, { man: target });
  const index = Number(saved?.optionIndex || 0);
  let questionB = render(
    Array.isArray(route.questionB) ? route.questionB[index] : route.questionB,
  );
  let choicesB = route.choicesB.map((c) => ({
    ...c,
    line: render(c.line),
    result: render(c.result),
  }));
  const previous = [13, 10, 3, 2]
    .filter((d) => d < day)
    .map((d) => readAnswer(state, `d${d}-date-choice-b`))
    .find(
      (a) =>
        a?.characterDate === true &&
        a.dateTarget === target &&
        a.dateQuestion === questionB,
    );
  if (previous && typeof previous.value === "string") {
    const clean = previous.value.replace(/^[「“]|[」”]$/g, "");
    questionB = `他提起上次你說的「${clean}」，沒有假裝忘記。\n\n「那今天呢，有沒有不一樣？」`;
    choicesB = choicesB.map((c) => ({
      ...c,
      line:
        c.line === previous.value
          ? "「和上次一樣，這次也還是我自己的意思。」"
          : `「有不一樣。${c.line.replace(/^[「“]|[」”]$/g, "")}」`,
      result:
        (c.line === previous.value
          ? "他點頭，說自己記得你上次也是這樣答。\n\n"
          : "他聽出和上次不同，停了一下才接話。\n\n") + c.result,
    }));
  }
  return {
    ...route,
    opening:
      render(route.opening) +
      (target === ex
        ? "\n\n他喊你名字時停了一下，像在把以前那個稱呼換回來。你們都聽見了，沒有人當著鏡頭補完。"
        : ""),
    questionA: render(route.questionA),
    questionB,
    middle: render(
      Array.isArray(route.middle) ? route.middle[index] : route.middle,
    ),
    ending: render(route.ending),
    choicesA: route.choicesA.map((c) => ({
      ...c,
      line: render(c.line),
      result: render(c.result),
    })),
    choicesB,
  };
}
