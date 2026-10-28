import { seasonValues } from "./season";
import type { Item, Runtime, Work } from "../schema";

export type Profile = {
  name: string;
  men: string[];
  ex: string;
  late: boolean;
  reason: string;
  reunion: number;
  maleCatfish?: string;
  femaleCatfish?: string;
  seed?: string;
  mbti?: string;
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
export function castFor(p: Profile, config: ProfileConfig) {
  const candidates = p.men.filter((m) => m !== p.ex);
  const male = p.late
    ? p.ex
    : candidates.includes(p.maleCatfish || "")
      ? p.maleCatfish!
      : candidates.at(-1)!;
  const female = config.women.includes(p.femaleCatfish || "")
    ? p.femaleCatfish!
    : config.women.at(-1)!;
  return {
    male,
    female,
    presentMen: p.men.filter((m) => m !== male),
    presentWomen: config.women.filter((w) => w !== female),
  };
}
export function saveProfile(
  p: Profile,
  config: ProfileConfig,
  random = Math.random,
): Profile {
  const pick = (list: string[]) =>
    list[
      Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)))
    ];
  return {
    ...p,
    name: p.name.trim(),
    maleCatfish: p.late ? p.ex : pick(p.men.filter((m) => m !== p.ex)),
    femaleCatfish: pick(config.women),
    seed: String(Math.floor(random() * 1e9)),
  };
}
export function groupEpisodeItems(items: Item[]): Item[] {
  return items
    .filter((i) => i.meta.episodePart !== "true")
    .map((root) => {
      if (root.meta.episodeRoot !== "true") return root;
      const parts = items
        .filter(
          (i) =>
            i.meta.episodePart === "true" &&
            i.meta.episode === root.meta.episode,
        )
        .sort((a, b) => a.time.localeCompare(b.time));
      return {
        ...root,
        body: [root.body, ...parts.map((i) => i.body)].join("\n\n"),
        meta: { ...root.meta, updates: String(parts.length) },
      };
    });
}
export function storyValues(
  work: Work,
  state: Runtime,
): Record<string, string> {
  const p = parseProfile(state.ui?.notes?.profile);
  if (!p) return {};
  const config = (work.data.notes || []).map(profileConfig).find(Boolean);
  if (work.variables.production === true && config)
    return seasonValues(work, state, p, config);
  const others = p.men.filter((m) => m !== p.ex);
  const cast = castFor(
    p,
    config || {
      men: p.men,
      women: ["尹書妍", "韓知恩", "宋夏琳", "崔有真", "白恩彩"],
      reasons: [],
    },
  );
  const other = cast.presentMen.find((m) => m !== p.ex)!;
  const [woman1, woman2, woman3, woman4] = cast.presentWomen;
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
  const setup = work.data.notes?.find((i) => i.meta.profileForm);
  const index = config?.reasons.indexOf(p.reason) ?? -1;
  let backstory: Record<string, string> = {};
  try {
    backstory = JSON.parse(setup?.meta["backstory" + index] || "{}");
  } catch {
    /* Older stories have no authored backstory. */
  }
  const route = (stage: string) =>
    ["past", "new", "self"].find((r) =>
      state.completed.includes(stage + "-" + r),
    ) || "self";
  const feeling = (stage: string) =>
    backstory[route(stage)] || "你決定給自己多一些時間，慢慢理解現在的心意。";
  const values: Record<string, string> = {
    ...backstory,
    history: backstory.history || p.reason,
    opening: p.late
      ? "X 還沒有到，你回想起以前相處時的片段：" +
        (backstory.opening || "那段沒有說完的過去，仍然留在心裡。")
      : backstory.opening || "你想起那段沒有說完的過去。",
    letter:
      backstory.letter || "有些話當時沒有說清楚，希望這次能更誠實地認識彼此。",
    dinnerFeeling:
      backstory[
        "dinner" +
          { past: "Past", new: "New", self: "Self" }[
            route("dinner") as "past" | "new" | "self"
          ]
      ] || feeling("dinner"),
    letterFeeling: feeling("letter"),
    smsFeeling:
      route("sms") === "past"
        ? "這則訊息只是一次重新開口，不是要求 X 立刻回頭；你也保留了改變決定的自由。"
        : route("sms") === "new"
          ? "你把今晚的感謝交給眼前的人，沒有把他當成忘掉過去的工具。"
          : "你沒有把一句晚安說成愛情，先用友善替明天留下一點空間。",
    reflection:
      backstory.next || "改變需要時間和行動，今晚不急著替明天下結論。",
    xResponse: p.late
      ? "X 尚未入住。你不知道他會如何回應；節目組沒有替他作出任何承諾。"
      : route("dinner") === "past"
        ? backstory.response || "他看了過來，沒有急著替你回答。"
        : route("dinner") === "new"
          ? "X 看見你和別人一起做飯，停了一下，仍把你認識新朋友的空間留給你。"
          : "X 沒有打斷你與女嘉賓的交談，這一次，沉默沒有被當作任何人的承諾。",
    letterArrival: p.late
      ? "X 尚未登場；節目組交來他事先留下的介紹信，他並不在合宿現場。"
      : "大家依次讀起前任介紹信。輪到你時，他低下頭，沒有替你接過話。",
    heartMessage: backstory.message || "希望我們能更誠實地理解彼此。",
    player: p.name,
    ex: p.ex,
    men: p.men.join("、"),
    other,
    woman1,
    woman2,
    woman3,
    woman4,
    presentWomen: [p.name, ...cast.presentWomen].join("、"),
    maleCatfish: cast.male,
    femaleCatfish: cast.female,
    catfishPlan: `首日五男五女；中期預定由 ${cast.male}、${cast.female} 以一男一女鯰魚身分加入，最終六男六女。`,
    reason: p.reason,
    arrival: p.late
      ? "X 是後期登場的鯰魚，第一天尚未入住；現場五男五女，一男一女鯰魚預定中期加入，完整陣容六男六女。"
      : "首日五男五女入住，一男一女鯰魚預定中期加入。X 與你隔著餐桌坐下，默契地裝作初次見面。",
    present: cast.presentMen.join("、"),
    pairs: [
      p.name + " ↔ " + p.ex,
      ...others.map((m, i) => `${config?.women[i] || "女嘉賓"} ↔ ${m}`),
    ].join("\n"),
    reunion: String(reunion),
    transfer: String(100 - reunion),
    xScene: p.late
      ? "大家只擺了十份餐具，你想起那個尚未抵達的人；他的時間還沒有到。"
      : `${p.ex} 下意識把溫水放到你手邊，又輕聲問了一句：「你也習慣喝溫的嗎？」`,
  };
  // Authored backstory text may reference the player's cast, rendered as plain text.
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      renderStoryText(value, { player: p.name, ex: p.ex, other }),
    ]),
  );
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
