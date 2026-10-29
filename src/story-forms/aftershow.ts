import type { Runtime, Work } from "../schema";
import { visible } from "../engine";
import { finalConsent, seeded, selected } from "./relationships";
import type { Profile, ProfileConfig } from "./profile";

type Outcome =
  "reunion" | "new" | "single" | "unreturnedReunion" | "unreturnedNew";
type Caption = { text: string; photo: string };
type Topic = { title: string; body: string; comments: string[] };
type AftershowBook = {
  outcomes: Record<
    Outcome,
    { captions: Caption[]; comments: string[]; topics: Topic[] }
  >;
  captionComments: string[][];
  topics: Topic[];
  igTopic: Topic;
};
type Publication = {
  value: string;
  caption: string;
  photo: string;
  comments: string[];
  outcome: Outcome;
};
const books = new WeakMap<Work, AftershowBook>();
function bookFor(work: Work) {
  let book = books.get(work);
  if (!book) {
    const raw = work.data.notes.find((i) => i.id === "aftershow-writing")?.body;
    if (!raw) return undefined;
    book = JSON.parse(raw) as AftershowBook;
    books.set(work, book);
  }
  return book;
}
export function aftershowOutcome(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
): Outcome {
  if (state.variables.finalRoute === "reunion")
    return finalConsent(work, state, p, config, p.ex).success
      ? "reunion"
      : "unreturnedReunion";
  if (state.variables.finalRoute === "new") {
    const target = selected(state, "final-new-target");
    return target && finalConsent(work, state, p, config, target).success
      ? "new"
      : "unreturnedNew";
  }
  return "single";
}
function publication(state: Runtime): Publication | undefined {
  try {
    const raw = state.ui?.instagram?.["answer:after-ig-compose"];
    if (typeof raw !== "string") return undefined;
    const saved = JSON.parse(raw) as Publication;
    return saved &&
      typeof saved.caption === "string" &&
      typeof saved.photo === "string" &&
      Array.isArray(saved.comments) &&
      saved.comments.every((c) => typeof c === "string")
      ? saved
      : undefined;
  } catch {
    return undefined;
  }
}
function words(text: string, values: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (all, key) => values[key] ?? all);
}
function context(state: Runtime, p: Profile, facts: Record<string, string>) {
  return {
    ...facts,
    player: p.name,
    ex: p.ex,
    finalPerson:
      state.variables.finalRoute === "new"
        ? selected(state, "final-new-target")
        : p.ex,
  };
}
function commentOrder(rows: string[], seed: string) {
  return [...new Set(rows)].sort((a, b) => seeded(seed + a) - seeded(seed + b));
}
// This is a story publication, not a real social account. Its copy is authored in story.json.
export function aftershowValues(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  facts: Record<string, string>,
) {
  const book = bookFor(work);
  if (!book || !state.read.includes("final-result")) return {};
  const outcome = aftershowOutcome(work, state, p, config),
    route = book.outcomes[outcome],
    values = context(state, p, facts),
    saved = publication(state),
    render = (text: string) => words(text, values),
    result: Record<string, string> = {
      afterIgOptions: JSON.stringify(route.captions.map((c) => render(c.text))),
      afterIgCaption: saved?.caption || "",
      afterIgPhoto: saved?.photo || "節目結束後的第一篇貼文",
    };
  for (let i = 0; i < 16; i++)
    result["afterIgComment" + i] = saved?.comments[i] || "";
  for (const [i, topic] of [
    ...route.topics,
    ...book.topics,
    book.igTopic,
  ].entries()) {
    result[`afterHotTitle${i + 1}`] = render(topic.title);
    result[`afterHotBody${i + 1}`] = render(topic.body);
    topic.comments.forEach((text, n) => {
      result[`afterHot${i + 1}Comment${n}`] = render(text);
    });
  }
  return result;
}
export function packAftershowPost(
  work: Work,
  state: Runtime,
  itemId: string,
  value: string,
  p: Profile,
  config: ProfileConfig,
  facts: Record<string, string>,
) {
  const item = work.data.instagram?.find((i) => i.id === itemId);
  const book = bookFor(work);
  if (
    !book ||
    itemId !== "after-ig-compose" ||
    !item ||
    !visible(item, state) ||
    !state.endings.length ||
    publication(state) ||
    state.completed.includes("publish-after-ig")
  )
    return undefined;
  const outcome = aftershowOutcome(work, state, p, config),
    route = book.outcomes[outcome],
    values = context(state, p, facts),
    render = (text: string) => words(text, values);
  const index = route.captions.findIndex((c) => render(c.text) === value);
  if (index < 0) return undefined;
  const caption = route.captions[index];
  const comments = commentOrder(
    route.comments.map(render),
    p.seed + "|after-ig|",
  ).concat(book.captionComments[index].map(render));
  return JSON.stringify({
    value,
    caption: value,
    photo: render(caption.photo),
    comments,
    outcome,
  } satisfies Publication);
}
