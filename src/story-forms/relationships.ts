import { savedAnswer } from "./answers";
import { affectionTable, chooseHearts } from "./hearts";
import type { Runtime, Work } from "../schema";
import { castFor, type Profile, type ProfileConfig } from "./profile";
export function seeded(seed: string): number {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
export function publicPartner(
  p: Profile,
  config: ProfileConfig,
  woman: string,
) {
  return [...castFor(p, config).presentMen].sort(
    (a, b) =>
      seeded(`${p.seed}|public-pair|${woman}|${b}`) -
      seeded(`${p.seed}|public-pair|${woman}|${a}`),
  )[0];
}
export function selected(state: Runtime, id: string): string {
  try {
    const saved = savedAnswer(state, id);
    return /^d\d+-focus$/.test(id) && typeof saved?.target === "string"
      ? saved.target
      : saved?.value || "";
  } catch {
    return "";
  }
}
export function repairOptions(
  work: Work,
  p: Profile,
  config: ProfileConfig,
  day = 0,
): string[] {
  const meta = work.data.notes.find((i) => i.id === "relationship-rules")?.meta;
  try {
    return JSON.parse(
      meta?.[`repair${config.reasons.indexOf(p.reason)}d${day}`] ||
        meta?.["repair" + config.reasons.indexOf(p.reason)] ||
        "[]",
    );
  } catch {
    return [];
  }
}
export function repairChoice(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  id: string,
) {
  try {
    const saved = savedAnswer(state, id);
    if (Number.isInteger(saved?.optionIndex))
      return saved!.optionIndex as number;
  } catch {
    /* Match recordings saved before option indices existed. */
  }
  const day = Number(id.match(/^d(\d+)/)?.[1] || 0),
    value = selected(state, id);
  const current = repairOptions(work, p, config, day).indexOf(value);
  return current >= 0 ? current : repairOptions(work, p, config).indexOf(value);
}
function committedAgain(work: Work, state: Runtime) {
  const item = work.data.kakao.find((i) => i.id === "d21-chat2"),
    value = selected(state, "d21-chat2");
  try {
    const saved = savedAnswer(state, "d21-chat2");
    if (Number.isInteger(saved?.optionIndex)) return saved?.optionIndex === 0;
    return [item?.meta.options, item?.meta.legacyOptions].some(
      (options) => JSON.parse(options || "[]")[0] === value,
    );
  } catch {
    return false;
  }
}
export type Relationship = {
  affinity: number;
  trust: number;
  clarity: number;
  repair: number;
  pressure: number;
  release: number;
  meetings: number;
  lastDay: number;
  sent: number;
};
// Recompute from immutable authored choices and saved answers. Reopening an app cannot award points.
export function relationshipHistory(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  throughDay = 21,
  includeSms = true,
): Record<string, Relationship>[] {
  const result = Object.fromEntries(
    p.men.map((name) => [
      name,
      {
        affinity:
          (name === p.ex ? 20 : 8) +
          Math.floor(seeded(`${p.seed}|affinity|${name}`) * 9),
        trust:
          (name === p.ex ? 8 : 12) +
          Math.floor(seeded(`${p.seed}|trust|${name}`) * 6),
        clarity: 0,
        repair: 0,
        pressure: 0,
        release: 0,
        meetings: 0,
        lastDay: 0,
        sent: 0,
      },
    ]),
  );
  const changes: {
    day: number;
    target: string;
    effect: Partial<Relationship>;
    meeting: boolean;
  }[] = [];
  if (state.read.includes("d0-meeting"))
    changes.push({ day: 0, target: p.ex, effect: {}, meeting: true });
  for (const item of work.data.kakao || []) {
    if (!item.meta.effects && item.meta.encounter !== "true") continue;
    const day = Number(item.meta.day || item.id.match(/^d(\d+)/)?.[1] || 0);
    if (day > throughDay) continue;
    const value = selected(state, item.id);
    try {
      const saved = savedAnswer(state, item.id);
      if (
        (item.meta.encounter === "true" && saved?.sceneId) ||
        saved?.characterDate === true
      ) {
        const target =
          (saved.characterDate ? saved.dateTarget : saved.target) || "";
        if (result[target])
          changes.push({
            day,
            target,
            effect: saved.sceneEffect || {},
            meeting:
              saved.sceneMeeting === true ||
              (saved.characterDate === true && item.id.endsWith("-a")),
          });
        continue;
      }
    } catch {
      /* Old recordings retain their original effects. */
    }
    if (!value || !item.meta.effects) continue;
    let opts: string[] = [];
    try {
      opts = item.meta.options?.startsWith("{{repairOptions")
        ? repairOptions(work, p, config, day)
        : JSON.parse(item.meta.legacyOptions || item.meta.options || "[]");
    } catch {
      continue;
    }
    const cast = castFor(p, config);
    const quiet = (day >= 10 ? p.men : cast.presentMen).filter(
      (m) => m !== p.ex,
    );
    opts = opts.map((o) =>
      o.replace(/\{\{quiet1\}\}/g, quiet[1 % quiet.length]),
    );
    let index = opts.indexOf(value);
    if (item.meta.options?.startsWith("{{repairOptions"))
      index = repairChoice(work, state, p, config, item.id);
    let exBranch = false;
    let dateTarget = "";
    try {
      const saved = savedAnswer(state, item.id);
      if (
        typeof saved?.optionIndex === "number" &&
        Number.isInteger(saved.optionIndex) &&
        saved.optionIndex >= 0 &&
        saved.optionIndex < opts.length
      )
        index = saved.optionIndex;
      exBranch = saved?.exBranch === true;
      dateTarget =
        typeof saved?.dateTarget === "string" ? saved.dateTarget : "";
    } catch {
      /* Older saves match their original text. */
    }
    if (index < 0) continue;
    const target =
      item.meta.effectTarget === "date"
        ? dateTarget
        : item.meta.effectTarget === "ex"
          ? p.ex
          : item.meta.effectTarget === "quiet"
            ? quiet[day % quiet.length]
            : selected(state, `d${day}-focus`);
    if (!result[target]) continue;
    const effects = JSON.parse(
      exBranch && item.meta.exEffects ? item.meta.exEffects : item.meta.effects,
    ) as Partial<Relationship>[];
    changes.push({
      day,
      target,
      effect: effects[index] || {},
      meeting:
        item.id.endsWith("-approach") ||
        item.id.endsWith("-date-choice-a") ||
        ["d7-repair", "d14-repair", "d19-repair", "d21-chat1"].includes(
          item.id,
        ),
    });
  }
  for (let d = 1; includeSms && d <= throughDay; d++) {
    if (!selected(state, `d${d}-sms`)) continue;
    changes.push({
      day: d,
      target: selected(state, `d${d}-recipient`),
      // Old recordings keep their original +1. New intentions are snapshotted
      // at sending; re-opening or later story changes never re-score a letter.
      effect: {
        ...(savedAnswer(state, `d${d}-sms`)?.smsEffect || { affinity: 1 }),
        sent: 1,
      },
      meeting: false,
    });
  }
  const history: Record<string, Relationship>[] = [];
  for (let d = 0; d <= throughDay; d++) {
    for (const change of changes.filter((c) => c.day === d)) {
      const r = result[change.target];
      if (!r) continue;
      for (const [key, delta] of Object.entries(change.effect)) {
        if (typeof delta === "number") r[key as keyof Relationship] += delta;
      }
      r.pressure = Math.max(0, r.pressure);
      if (change.meeting) {
        r.meetings++;
        r.lastDay = d;
      }
    }
    history[d] = Object.fromEntries(
      Object.entries(result).map(([name, r]) => [name, { ...r }]),
    );
  }
  return history;
}
export function relationships(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  throughDay = 21,
  includeSms = true,
) {
  return relationshipHistory(work, state, p, config, throughDay, includeSms)[
    throughDay
  ];
}
export function hiddenAffections(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  day: number,
  throughDay = day,
) {
  // Anonymous letters do not identify their sender. Only observed interactions
  // count towards an NPC's feelings; the player's own intention remains saved.
  const history = relationshipHistory(
    work,
    state,
    p,
    config,
    throughDay,
    false,
  );
  const visiblePartners = Object.fromEntries(
    config.women.map((woman) => [woman, publicPartner(p, config, woman)]),
  );
  return affectionTable(
    work,
    state,
    p,
    config,
    day,
    history[throughDay],
    history[0],
    visiblePartners,
    throughDay,
  );
}
export type ReadinessCode =
  | "contact"
  | "distance"
  | "pressure"
  | "trust"
  | "repair"
  | "clarity"
  | "direction"
  | "player"
  | "ready";
const readinessReasons: Record<ReadinessCode, string> = {
  contact: "你們真正單獨相處的時間還不夠，對方不想把留戀直接說成承諾。",
  distance: "後來的靠近漸漸中斷，對方不想把早先的心動當成現在已經說好的未來。",
  pressure:
    "對方仍在意你，但相處裡累積的壓力還在，沒有把想念當成問題已經解決。",
  trust: "彼此還有好感，但重新建立的信任還不夠，對方目前仍有不安。",
  repair: "你們仍有熟悉和留戀，但分開的問題還沒一起談出具體的改變方式。",
  clarity: "彼此有心動，但還沒把想要的相處說清楚，對方不想只靠猜測答應以後。",
  direction: "對方沒有否認曾經的心動，但目前的心意還沒有和你走到同一個方向。",
  player:
    "最後的談話裡，你選擇暫不確認復合；對方尊重你的界線，這不等於對方拒絕了你。",
  ready: "你們的靠近、信任和對未來的表達，已經能夠互相接上。",
};
export function relationshipReadiness(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  target: string,
  day = 21,
) {
  const r = relationships(work, state, p, config, day, false)[target];
  let code: ReadinessCode = "ready";
  if (!r || r.meetings < (target === p.ex ? 3 : 4)) code = "contact";
  else if (r.lastDay < (day >= 17 ? 17 : Math.max(1, day - 6)))
    code = "distance";
  else if (r.pressure > 10) code = "pressure";
  else if (r.trust < 26) code = "trust";
  else if (target === p.ex && r.repair < 7) code = "repair";
  else if (r.clarity < 3) code = "clarity";
  else {
    const feelings = hiddenAffections(work, state, p, config, day)[target];
    if (
      !feelings?.[p.name]?.eligible ||
      chooseHearts({ [target]: feelings })[target] !== p.name
    )
      code = "direction";
  }
  return { ready: code === "ready", code, reason: readinessReasons[code] };
}
export function playerReunionConfirmed(work: Work, state: Runtime) {
  return committedAgain(work, state);
}
type CommitmentEntry = { talk: string; sms: string[] };
type CommitmentBook = Partial<Record<ReadinessCode, CommitmentEntry>> & {
  repairs?: CommitmentEntry[];
};
const commitmentBooks = new WeakMap<Work, CommitmentBook>();
export function commitmentWords(
  work: Work,
  p: Profile,
  config: ProfileConfig,
  code: ReadinessCode,
) {
  try {
    let all = commitmentBooks.get(work);
    if (!all) {
      all =
        JSON.parse(
          work.data.notes.find((n) => n.id === "relationship-rules")?.body ||
            "{}",
        ).commitmentWords || {};
      commitmentBooks.set(work, all!);
    }
    const entry =
      code === "repair"
        ? all?.repairs?.[Math.max(0, config.reasons.indexOf(p.reason))]
        : all?.[code];
    return entry as { talk: string; sms: string[] } | undefined;
  } catch {
    return undefined;
  }
}
export function finalConsent(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  target: string,
) {
  const finalYes =
    state.variables.finalRoute === "reunion" &&
    state.completed.includes("final-reunion");
  if (target === p.ex && !finalYes && !committedAgain(work, state))
    return {
      success: false,
      code: "player" as const,
      reason: readinessReasons.player,
    };
  const readiness = relationshipReadiness(work, state, p, config, target, 21);
  if (!readiness.ready)
    return { success: false, code: readiness.code, reason: readiness.reason };
  return {
    success: true,
    code: "ready" as const,
    reason:
      target === p.ex
        ? "你們不只重提回憶，也練習了不同的相處方式；最後兩個人都願意把這份改變帶回生活。"
        : "後來沒有中斷的靠近與坦白，讓對方也想把這段關係延續到節目以後。",
  };
}
