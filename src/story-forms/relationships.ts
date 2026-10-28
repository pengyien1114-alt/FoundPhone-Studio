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
export function selected(state: Runtime, id: string): string {
  try {
    return (
      JSON.parse(String(state.ui?.kakao?.["answer:" + id] || "null"))?.value ||
      ""
    );
  } catch {
    return "";
  }
}
export function repairOptions(
  work: Work,
  p: Profile,
  config: ProfileConfig,
): string[] {
  const meta = work.data.notes.find((i) => i.id === "relationship-rules")?.meta;
  try {
    return JSON.parse(
      meta?.["repair" + config.reasons.indexOf(p.reason)] || "[]",
    );
  } catch {
    return [];
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
): Record<string, Relationship>[] {
  const result = Object.fromEntries(
    p.men.map((name) => [
      name,
      {
        affinity: 8 + Math.floor(seeded(`${p.seed}|affinity|${name}`) * 9),
        trust: 12 + Math.floor(seeded(`${p.seed}|trust|${name}`) * 6),
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
  for (const item of work.data.kakao || []) {
    if (!item.meta.effects) continue;
    const day = Number(item.meta.day || item.id.match(/^d(\d+)/)?.[1] || 0);
    if (day > throughDay) continue;
    const value = selected(state, item.id);
    if (!value) continue;
    let opts: string[] = [];
    try {
      opts =
        item.meta.options === "{{repairOptions}}"
          ? repairOptions(work, p, config)
          : JSON.parse(item.meta.options || "[]");
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
    const index = opts.indexOf(value);
    if (index < 0) continue;
    const target =
      item.meta.effectTarget === "ex"
        ? p.ex
        : item.meta.effectTarget === "quiet"
          ? quiet[day % quiet.length]
          : selected(state, `d${day}-focus`);
    if (!result[target]) continue;
    const effects = JSON.parse(item.meta.effects) as Partial<Relationship>[];
    changes.push({
      day,
      target,
      effect: effects[index] || {},
      meeting: item.id.endsWith("-approach"),
    });
  }
  for (let d = 1; d <= throughDay; d++) {
    if (!selected(state, `d${d}-sms`)) continue;
    changes.push({
      day: d,
      target: selected(state, `d${d}-recipient`),
      effect: { affinity: 1, sent: 1 },
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
) {
  return relationshipHistory(work, state, p, config, throughDay)[throughDay];
}
// NPCs have preferences among other residents. No final coin toss and no automatic reciprocity.
export function rivalInterest(
  p: Profile,
  config: ProfileConfig,
  man: string,
  day: number,
): number {
  return Math.max(
    ...config.women.map(
      (w) =>
        25 +
        seeded(`${p.seed}|rival|${man}|${w}`) * 13 +
        Math.min(day, 14) * 0.25,
    ),
  );
}
export function interest(r: Relationship): number {
  return r.affinity + r.trust * 0.4 - r.pressure * 1.8;
}
export function finalConsent(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  target: string,
) {
  const r = relationships(work, state, p, config)[target];
  if (!r || r.meetings < (target === p.ex ? 3 : 4))
    return {
      success: false,
      reason:
        "你們真正單獨說話的次數還不夠，對方不想只靠最後一天的心意作承諾。",
    };
  if (r.lastDay < 17)
    return {
      success: false,
      reason:
        "後來的相處漸漸中斷，對方沒有把早先的靠近當成現在仍然有效的約定。",
    };
  if (r.pressure > 10 || r.trust < 26)
    return {
      success: false,
      reason:
        "對方在意你，但幾次被催著確認心意之後，仍不相信你們能安心面對不同的答案。",
    };
  if (target === p.ex) {
    if (
      r.repair < 7 ||
      selected(state, "d21-chat1") !== repairOptions(work, p, config)[0]
    )
      return {
        success: false,
        reason:
          "你們仍有熟悉和留戀，但讓關係走到分開的問題，還沒有一起找到具體的改變方式。",
      };
    if (
      selected(state, "d21-chat2") !==
      "我願意重新交往，但要把剛才談的改變放進生活裡。"
    )
      return {
        success: false,
        reason:
          "最後一次談話裡，你還沒有答應重新交往；對方尊重你提出的界線，沒有把終選變成跳過那段談話的捷徑。",
      };
  }
  if (r.clarity < 3 || interest(r) <= rivalInterest(p, config, target, 21))
    return {
      success: false,
      reason:
        "相處裡有開心的時刻，但對方的心意沒有和你走到同一個方向。這不是多等一封短信就能交換的答案。",
    };
  return {
    success: true,
    reason:
      target === p.ex
        ? "你們不只重提回憶，也在幾次談話裡練習了不同的做法；最後兩個人都願意把具體的改變帶回生活。"
        : "幾次主動相處、可以說出不安的談話，以及後來沒有中斷的靠近，讓對方也想認真延續這段關係。",
  };
}
