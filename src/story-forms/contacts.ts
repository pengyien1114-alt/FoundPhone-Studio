import { savedAnswer } from "./answers";
import type { Runtime, Work } from "../schema";
import { castFor, type Profile, type ProfileConfig } from "./profile";
import { selected, seeded } from "./relationships";
export function approachIndex(work: Work, state: Runtime, day: number) {
  const id = `d${day}-approach`;
  try {
    const saved = savedAnswer(state, id);
    if (saved?.sceneId)
      return Number(saved.sceneSignal || 0) < 0
        ? 1
        : Number(saved.sceneSignal || 0) > 0
          ? 0
          : 2;
    if (Number.isInteger(saved?.optionIndex))
      return saved!.optionIndex as number;
  } catch {
    /* Legacy answer. */
  }
  const item = work.data.kakao.find((i) => i.id === id);
  try {
    return (
      JSON.parse(
        item?.meta.legacyOptions || item?.meta.options || "[]",
      ) as string[]
    ).indexOf(selected(state, id));
  } catch {
    return -1;
  }
}
export function firstNightSignals(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  man: string,
) {
  let points = 0;
  const cast = castFor(p, config);
  if (!cast.presentMen.includes(man)) return 0;
  if (selected(state, "d1-seat").includes(man)) points += 3;
  const newer = cast.presentMen.filter((n) => n !== p.ex),
    quiet = newer[1 % newer.length];
  if (man === quiet) {
    const kitchen = selected(state, "d1-action");
    if (
      kitchen.includes("主動") ||
      kitchen.includes("需要") ||
      kitchen.includes("幫忙") ||
      kitchen.includes("不辣")
    )
      points += 5;
    else if (kitchen) points += 2;
    if (selected(state, "d1-table").includes(man)) points += 3;
  }
  if (selected(state, "d1-focus") === man && selected(state, "d1-approach")) {
    const index = approachIndex(work, state, 1);
    points += index === 0 ? 12 : index === 1 ? -7 : 4;
  }
  return points;
}
// First-night choices represent observed attention, not a rescue roll or the player's SMS recipient.
export function firstNightScore(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  man: string,
  woman: string,
) {
  if (woman === p.name) {
    const oldPull =
      man === p.ex
        ? [2, 1, -1, 3, 1, 1][Math.max(0, config.reasons.indexOf(p.reason))]
        : 0;
    return (
      14 +
      seeded(`${p.seed}|opening-player|${man}`) * 6 +
      firstNightSignals(work, state, p, config, man) +
      oldPull
    );
  }
  const former = p.men.filter((m) => m !== p.ex).findIndex((m) => m === man);
  const oldPartner = former >= 0 ? config.women[former] : undefined;
  return (
    12 +
    seeded(`${p.seed}|opening-other|${man}|${woman}`) * 8 +
    (woman === oldPartner ? 3 : 0)
  );
}
