import type { Runtime, Work } from "../schema";
import { momentRecord } from "./encounters";
export function daytimeValues(
  work: Work,
  state: Runtime,
  facts: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  const render = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, key) => facts[key] || "");
  for (const post of work.data.twitter) {
    if (!post.meta.morningReactions) continue;
    const day = Number(post.meta.day),
      choice = momentRecord(state, `d${day}-daily`);
    const original = work.data.kakao.find((i) => i.id === `d${day}-daily`);
    let index = choice?.optionIndex;
    if (!Number.isInteger(index)) {
      try {
        index = (
          JSON.parse(original?.meta.legacyOptions || "[]") as string[]
        ).indexOf(choice?.value || "");
      } catch {
        index = -1;
      }
    }
    const reactions = JSON.parse(post.meta.morningReactions) as string[],
      outcomes = JSON.parse(post.meta.morningOutcomes || "[]") as string[];
    values[`morningReact${day}`] =
      index! >= 0 ? render(reactions[index!] || "") : "";
    values[`morningAfter${day}`] =
      index! >= 0 ? render(outcomes[index!] || "") : "";
  }
  return values;
}
