import type { Item, Runtime, Work } from "../schema";

export type Profile = {
  name: string;
  men: string[];
  ex: string;
  late: boolean;
  reason: string;
  reunion: number;
};
export type ProfileConfig = {
  men: string[];
  women: string[];
  reasons: string[];
};
export function parseProfile(value: unknown, draft = false): Profile | null {
  try {
    const p = JSON.parse(String(value));
    return p &&
      typeof p.name === "string" &&
      (draft || p.name.trim().length > 0) &&
      p.name.length <= 20 &&
      Array.isArray(p.men) &&
      (draft ? p.men.length <= 6 : p.men.length === 6) &&
      p.men.every((m: unknown) => typeof m === "string") &&
      new Set(p.men).size === p.men.length &&
      (draft || p.men.includes(p.ex)) &&
      typeof p.late === "boolean" &&
      typeof p.reason === "string" &&
      Number.isInteger(p.reunion) &&
      p.reunion >= 0 &&
      p.reunion <= 100
      ? p
      : null;
  } catch {
    return null;
  }
}
export function profileConfig(item: Item): ProfileConfig | null {
  try {
    const c = JSON.parse(item.meta.profileForm || "null");
    return c &&
      [c.men, c.women, c.reasons].every(
        (a) =>
          Array.isArray(a) && a.every((s: unknown) => typeof s === "string"),
      )
      ? c
      : null;
  } catch {
    return null;
  }
}
export function storyValues(
  work: Work,
  state: Runtime,
): Record<string, string> {
  const p = parseProfile(state.ui?.notes?.profile);
  if (!p) return {};
  const config = (work.data.notes || []).map(profileConfig).find(Boolean);
  const others = p.men.filter((m) => m !== p.ex);
  const reunion = Math.max(
    0,
    Math.min(
      100,
      p.reunion +
        Number(state.variables.reunionDelta || 0) +
        Number(state.variables.dinnerDelta || 0) +
        Number(state.variables.messageDelta || 0),
    ),
  );
  return {
    player: p.name,
    ex: p.ex,
    men: p.men.join("、"),
    other: others[0],
    reason: p.reason,
    arrival: p.late
      ? "X 是後期登場的鯰魚，第一天尚未入住；現場五男六女，完整陣容六男六女。"
      : "六男六女全員入住。X 與你隔著餐桌坐下，默契地裝作初次見面。",
    present: p.men.filter((m) => !p.late || m !== p.ex).join("、"),
    pairs: [
      p.name + " ↔ " + p.ex,
      ...others.map((m, i) => `${config?.women[i] || "女嘉賓"} ↔ ${m}`),
    ].join("\n"),
    reunion: String(reunion),
    transfer: String(100 - reunion),
    xScene: p.late
      ? "空著的第六個男嘉賓座位讓你想起那個尚未抵達的人。"
      : `${p.ex} 下意識把溫水放到你手邊，又輕聲問了一句：「你也習慣喝溫的嗎？」`,
  };
}
export function renderStoryText(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (all, key) => values[key] ?? all);
}
export function renderStoryItem(
  item: Item,
  values: Record<string, string>,
): Item {
  const render = (s: string) => renderStoryText(s, values);
  return {
    ...item,
    title: render(item.title),
    body: render(item.body),
    sender: render(item.sender),
    comments: item.comments.map(render),
    meta: Object.fromEntries(
      Object.entries(item.meta).map(([k, v]) => [k, render(v)]),
    ),
  };
}
