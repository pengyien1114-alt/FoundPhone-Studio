import type { Runtime, Work } from "../schema";
import { castFor, type Profile, type ProfileConfig } from "./profile";
import { savedAnswer } from "./answers";
import type { Relationship } from "./relationships";

type Temperament = {
  affinity: number;
  trust: number;
  pressure: number;
  attachment: number;
};
export type HeartRules = {
  version: 1;
  baseAttraction: number;
  attractionSpread: number;
  baseTrust: number;
  trustSpread: number;
  priorRelationship: number;
  routineGrowth: number;
  routineLimit: number;
  continuity: number;
  moodRange: number;
  distanceLoss: number;
  weights: Record<string, Temperament>;
};
export type HeartCell = {
  attraction: number;
  trust: number;
  pressure: number;
  score: number;
  eligible: boolean;
};
export type HeartTable = Record<string, Record<string, HeartCell>>;
const books = new WeakMap<Work, HeartRules>();
export function heartRules(work: Work): HeartRules {
  const cached = books.get(work);
  if (cached) return cached;
  const rows = JSON.parse(
    work.data.notes?.find((n) => n.id === "relationship-rules")?.meta
      .nightlyAffection || "null",
  );
  const rules: HeartRules = rows || {
    version: 1,
    baseAttraction: 16,
    attractionSpread: 8,
    baseTrust: 10,
    trustSpread: 5,
    priorRelationship: 6,
    routineGrowth: 0.25,
    routineLimit: 3,
    continuity: 1.25,
    moodRange: 0.75,
    distanceLoss: 0.6,
    weights: {},
  };
  books.set(work, rules);
  return rules;
}
// Avalanche the full key: neighbouring days/names must not move every NPC in
// the same direction. This does not change existing story seeds or saved scenes.
function noise(key: string) {
  let h = 2166136261;
  for (const c of key) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function pick(state: Runtime, id: string) {
  const a = savedAnswer(state, id);
  return id.endsWith("-focus") ? a?.target || a?.value || "" : a?.value || "";
}
function round(n: number) {
  return Math.round(n * 100) / 100;
}
export function affectionTable(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  day: number,
  observed: Record<string, Relationship>,
  initial: Record<string, Relationship>,
  visiblePartners: Record<string, string>,
  observedThroughDay = day,
): HeartTable {
  const rules = heartRules(work),
    cast = castFor(p, config);
  const men = day >= 10 ? p.men : cast.presentMen,
    women = [p.name, ...(day >= 3 ? config.women : cast.presentWomen)];
  const pairs = [
    { man: p.ex, woman: p.name },
    ...p.men
      .filter((m) => m !== p.ex)
      .map((man, i) => ({ man, woman: config.women[i] })),
  ];
  const table: HeartTable = {};
  const previous = savedAnswer(state, `d${day - 1}-sms`)?.votes || [];
  const actualDates = [2, 3, 10, 13]
    .filter((d) => d <= observedThroughDay)
    .map((d) => ({
      day: d,
      pairs: savedAnswer(state, `d${d}-date-choice-b`)?.datePairs,
    }));
  for (const from of [...men, ...women.filter((w) => w !== p.name)]) {
    const candidates = men.includes(from) ? women : men;
    const ownPast = pairs.find(
      (pair) => pair.man === from || pair.woman === from,
    );
    const ownX = ownPast?.man === from ? ownPast.woman : ownPast?.man;
    const voice = rules.weights[from] || {
      affinity: 1,
      trust: 0.55,
      pressure: 1.8,
      attachment: 1,
    };
    const previousTarget = previous.find((v) => v.from === from)?.to;
    table[from] = {};
    for (const to of candidates) {
      const key = `${p.seed || p.name}|heart|${from}|${to}`;
      let attraction =
        rules.baseAttraction +
        noise(key + "|attraction") * rules.attractionSpread;
      let trust = rules.baseTrust + noise(key + "|trust") * rules.trustSpread;
      let pressure = 0,
        eligible = true;
      const isPlayer = to === p.name,
        isX = to === ownX;
      // A past relationship is familiarity, not automatic present-day consent.
      if (isX)
        attraction +=
          rules.priorRelationship *
          voice.attachment *
          (0.7 + noise(key + "|past") * 0.6);
      if (isPlayer) {
        const r = observed[from];
        if (!r) continue;
        // These are the original bond baselines, removed before comparing the
        // player with everyone else on the same hidden scale.
        const baseline = initial[from];
        const kitchen = cast.presentMen.filter((m) => m !== p.ex)[
          1 % cast.presentMen.filter((m) => m !== p.ex).length
        ];
        const briefKitchen =
          day <= 3 && from === kitchen && !!pick(state, "d1-action");
        eligible = isX || r.meetings > 0 || briefKitchen;
        const last = r.lastDay || (briefKitchen ? 1 : 0);
        const gap = last ? Math.max(0, day - last) : day;
        const recency = Math.max(0.45, 1 - Math.max(0, gap - 1) * 0.08);
        attraction +=
          (r.affinity - baseline.affinity) * voice.affinity * recency;
        trust += r.trust - baseline.trust;
        pressure = r.pressure;
        attraction += r.clarity * 0.12 + r.repair * 0.35 - r.release * 0.5;
        if (!isX) attraction -= Math.max(0, gap - 2) * rules.distanceLoss;
        else
          attraction -= [1, 2, 3, 2, 1, 2][
            Math.max(0, config.reasons.indexOf(p.reason))
          ];
      } else {
        // Own pair's routine, not knowledge of anyone else's secret X pairing.
        const together = men.includes(from)
          ? visiblePartners[to] === from
          : visiblePartners[from] === to;
        const arrived = Math.max(
          from === cast.male || to === cast.male ? 10 : 1,
          from === cast.female || to === cast.female ? 3 : 1,
        );
        if (together)
          attraction += Math.min(
            rules.routineLimit,
            Math.max(0, day - arrived + 1) * rules.routineGrowth,
          );
        // NPC relationships have their own steady direction beyond player scenes.
        attraction +=
          noise(key + "|connection") *
          Math.min(4, Math.max(0, day - arrived) * 0.3);
        for (const date of actualDates) {
          const shared = men.includes(from)
            ? date.pairs?.[to] === from
            : date.pairs?.[from] === to;
          if (!shared) continue;
          trust += 1;
          // Being assigned a date provides contact, not guaranteed romance.
          attraction += (noise(`${key}|date|${date.day}`) - 0.4) * 3;
        }
      }
      attraction = Math.max(0, Math.min(95, attraction));
      trust = Math.max(0, Math.min(75, trust));
      const continuity = previousTarget === to ? rules.continuity : 0;
      const mood = (noise(`${key}|night|${day}`) - 0.5) * 2 * rules.moodRange;
      table[from][to] = {
        attraction: round(attraction),
        trust: round(trust),
        pressure: round(pressure),
        score: round(
          attraction +
            trust * voice.trust -
            pressure * voice.pressure +
            continuity +
            mood,
        ),
        eligible,
      };
    }
  }
  return table;
}
export function chooseHearts(table: HeartTable): Record<string, string> {
  return Object.fromEntries(
    Object.entries(table).map(([from, row]) => [
      from,
      Object.entries(row)
        .filter(([, cell]) => cell.eligible)
        .sort(
          (a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]),
        )[0]?.[0] || "",
    ]),
  );
}
export function heartScores(table: HeartTable) {
  return Object.fromEntries(
    Object.entries(table).map(([from, row]) => [
      from,
      Object.fromEntries(
        Object.entries(row).map(([to, cell]) => [to, cell.score]),
      ),
    ]),
  );
}
