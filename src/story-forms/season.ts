import { savedAnswer } from "./answers";
import { socialValues } from "./social";
import { dateValues } from "./dates";
import { packMoment, momentFor } from "./encounters";
import { dateRoute, type CharacterDateAnswer } from "./characters";
import { daytimeValues } from "./daytime";
import {
  incomingToPlayer,
  otherSms,
  smsChoices,
  smsContext,
  smsEffect,
} from "./messages";
import { firstNightScore, firstNightSignals } from "./contacts";
import {
  seeded,
  relationships,
  finalConsent,
  interest,
  rivalInterest,
  selected,
  publicPartner,
} from "./relationships";
export { seeded } from "./relationships";
import { interactionValues } from "./scenes";
import type { Item, Runtime, Work } from "../schema";
import {
  castFor,
  parseProfile,
  profileConfig,
  type Profile,
  type ProfileConfig,
} from "./profile";

type Answer = {
  value: string;
  votes?: Vote[];
  optionIndex?: number;
  exBranch?: boolean;
  reaction?: { meetings: number; pressure: number };
  dateTarget?: string;
  smsVersion?: 2;
  smsIntent?: string;
  smsOptions?: string[];
  smsEffect?: Record<string, number>;
} & Partial<CharacterDateAnswer>;
type Vote = { from: string; to: string; text: string };
export function answer(state: Runtime, id: string): string {
  return selected(state, id);
}
export function storedVotes(state: Runtime, day: number): Vote[] | undefined {
  try {
    return savedAnswer(state, `d${day}-sms`)?.votes;
  } catch {
    return undefined;
  }
}
function context(work: Work, state: Runtime) {
  const p = parseProfile(state.ui?.notes?.profile);
  const config = work.data.notes?.map(profileConfig).find(Boolean);
  if (!p || !config) return null;
  return { p, config, cast: castFor(p, config) };
}
export function residentCast(p: Profile, config: ProfileConfig, day: number) {
  const c = castFor(p, config);
  return {
    men: day >= 10 ? p.men : c.presentMen,
    women: [p.name, ...(day >= 3 ? config.women : c.presentWomen)],
  };
}
export function pairsFor(p: Profile, config: ProfileConfig) {
  return [
    { woman: p.name, man: p.ex },
    ...p.men
      .filter((m) => m !== p.ex)
      .map((man, i) => ({ woman: config.women[i], man })),
  ];
}
function rank(p: Profile, key: string, day: number, a: string, b: string) {
  return seeded(`${p.seed || p.name}|${key}|${day}|${a}|${b}`);
}
// Resolve independent preferences, allow contested choices, then fill only eligible vacancies.
export function matchPairs(
  men: string[],
  women: string[],
  preferred: Record<string, string>,
  allowed: (w: string, m: string) => boolean,
  score: (m: string, w: string) => number,
) {
  const result: Record<string, string> = {},
    used = new Set<string>();
  for (const m of men) {
    const claimants = women.filter((w) => preferred[w] === m && allowed(w, m));
    if (claimants.length) {
      const winner = claimants.sort((a, b) => score(m, b) - score(m, a))[0];
      result[winner] = m;
      used.add(m);
    }
  }
  const pending = women.filter((w) => !result[w]);
  function fill(i: number): boolean {
    if (i >= pending.length) return true;
    const w = pending[i];
    for (const m of men
      .filter((x) => !used.has(x) && allowed(w, x))
      .sort((a, b) => score(b, w) - score(a, w))) {
      result[w] = m;
      used.add(m);
      if (fill(i + 1)) return true;
      delete result[w];
      used.delete(m);
    }
    return false;
  }
  if (!fill(0)) {
    // A preferred allocation can block the final non-X seat. Retry a full eligible matching.
    for (const w of Object.keys(result)) delete result[w];
    used.clear();
    function all(i: number): boolean {
      if (i === women.length) return true;
      const w = women[i];
      for (const m of men
        .filter((x) => !used.has(x) && allowed(w, x))
        .sort(
          (a, b) =>
            Number(preferred[w] === b) - Number(preferred[w] === a) ||
            score(b, w) - score(a, w),
        )) {
        result[w] = m;
        used.add(m);
        if (all(i + 1)) return true;
        delete result[w];
        used.delete(m);
      }
      return false;
    }
    all(0);
  }
  return result;
}
export function dateMatches(
  p: Profile,
  config: ProfileConfig,
  state: Runtime,
  day: number,
) {
  const residents = residentCast(p, config, day === 3 ? 2 : day);
  const pairs = pairsFor(p, config);
  const preferred: Record<string, string> = {};
  for (const w of residents.women) {
    const eligible = residents.men.filter(
      (m) => day !== 2 || pairs.find((r) => r.woman === w)?.man !== m,
    );
    preferred[w] = eligible.sort(
      (a, b) =>
        rank(p, "date-preference", day, w, b) -
        rank(p, "date-preference", day, w, a),
    )[0];
  }
  if (day === 2 && answer(state, "d2-date"))
    preferred[p.name] = answer(state, "d2-date");
  const eligible = (w: string, m: string) =>
    (day !== 2 && day !== 3) || pairs.find((r) => r.woman === w)?.man !== m;
  if (day === 3) {
    for (const pair of pairs) {
      if (!residents.women.includes(pair.woman)) continue;
      const options = residents.men.filter((m) => m !== pair.man);
      preferred[pair.woman] = options.sort(
        (a, b) =>
          rank(p, "ex-assignment", day, pair.man, b) -
          rank(p, "ex-assignment", day, pair.man, a),
      )[0];
    }
  }
  return matchPairs(
    residents.men,
    residents.women,
    preferred,
    eligible,
    (m, w) => rank(p, "male-counterselection", day, m, w),
  );
}
function nightlyVotes(
  work: Work,
  p: Profile,
  config: ProfileConfig,
  state: Runtime,
  day: number,
  text: string,
): Vote[] {
  const residents = residentCast(p, config, day);
  const pairs = pairsFor(p, config);
  const votes: Vote[] = [];
  const bonds = relationships(work, state, p, config, day);
  for (const from of [...residents.men, ...residents.women]) {
    const candidates = residents.men.includes(from)
      ? residents.women
      : residents.men;
    if (from === p.name) {
      votes.push({ from, to: answer(state, `d${day}-recipient`), text });
      continue;
    }
    const ex = pairs.find((r) => r.man === from || r.woman === from);
    const oldPartner = ex?.man === from ? ex.woman : ex?.man;
    const previous = storedVotes(state, day - 1)?.find(
      (vote) => vote.from === from,
    )?.to;
    const to = [...candidates].sort((a, b) => {
      const score = (v: string) => {
        if (day === 1 && residents.men.includes(from))
          return firstNightScore(work, state, p, config, from, v);
        if (residents.men.includes(from)) {
          if (v === p.name)
            return (
              interest(bonds[from]) -
              bonds[from].sent +
              Math.max(0, firstNightSignals(work, state, p, config, from)) *
                Math.max(0, (6 - day) / 10) +
              (from === p.ex ? 6 : 0) +
              rank(p, "nightly-mood", day, from, v) * 8
            );
          return (
            14 +
            seeded(`${p.seed}|rival|${from}|${v}`) * 9 +
            Math.min(day, 14) * 0.65 +
            (publicPartner(p, config, v) === from ? Math.min(4, day / 5) : 0) +
            (v === oldPartner ? 3 : 0) +
            rank(p, "nightly-mood", day, from, v) * 8 +
            (v === previous ? 2 : 0)
          );
        }
        return (
          rank(p, "nightly-heart", day, from, v) +
          (v === previous ? 0.18 : 0) +
          (v === oldPartner ? 0.12 : 0) +
          (publicPartner(p, config, from) === v ? Math.min(0.25, day / 40) : 0)
        );
      };
      return score(b) - score(a);
    })[0];
    votes.push({
      from,
      to,
      text:
        to === p.name
          ? incomingToPlayer(work, state, p, config, from, day)
          : otherSms(work, state, p, config, from, to, day),
    });
  }
  return votes;
}
export function inputError(item: Item, value: string): string {
  const v = value.trim();
  if (!v) return "請先回答這一題。";
  if (v.length > Number(item.meta.maxLength || 1000))
    return "內容超過此題字數上限。";
  if (v.length < Number(item.meta.minLength || 1))
    return `請至少填寫 ${item.meta.minLength} 字。`;
  if (item.meta.form === "select") {
    try {
      if (!(JSON.parse(item.meta.options || "[]") as string[]).includes(v))
        return "請從目前提供的選項選擇。";
    } catch {
      return "選項尚未準備好。";
    }
  }
  if (
    item.meta.taskEvidence === "true" &&
    /未完成|沒完成|没完成|還沒|还没|沒有完成|没有完成/.test(v)
  )
    return "任務尚未完成，請先完成正式任務環節，再提交實際過程。";
  if (
    item.meta.privacy === "anonymous" &&
    /姓名|名字|本名|職業|职业|工作|年齡|年龄|幾歲|几岁|你是誰|你是谁/.test(v)
  )
    return "限時聊天室只能交流約會準備，不得詢問身分、年齡或職業。";
  if (item.meta.form === "sms" || item.meta.sms === "true") {
    const sentences = v
      .split(/[。！？!?]+|[.]+(?=\s|$)|\n+/)
      .filter((s) => s.trim());
    if (sentences.length > 2) return "心動短信最多兩句，請縮短後再送出。";
  }
  return "";
}
export function packSeasonAnswer(
  work: Work,
  state: Runtime,
  id: string,
  value: string,
): string | undefined {
  const item = work.data.kakao?.find((i) => i.id === id);
  const c = context(work, state);
  if (
    !item ||
    !c ||
    !item.meta.form ||
    state.completed.includes("submit-" + id) ||
    !state.unlocked.includes(id)
  )
    return undefined;
  const values = seasonValues(work, state, c.p, c.config);
  const projected = {
    ...item,
    meta: {
      ...item.meta,
      options: item.meta.options?.replace(
        /\{\{(\w+)\}\}/g,
        (_, k) => values[k] || "",
      ),
    },
  };
  if (inputError(projected, value)) return undefined;
  const moment = id.match(/^d(\d+)-(focus|approach)$/);
  if (moment) {
    const packed = packMoment(
      work,
      state,
      c.p,
      c.config,
      Number(moment[1]),
      moment[2] as "focus" | "approach",
      value.trim(),
    );
    if (packed) return JSON.stringify(packed);
  }
  const a: Answer = {
    value: value.trim(),
    optionIndex: (
      JSON.parse(projected.meta.options || "[]") as string[]
    ).indexOf(value.trim()),
  };
  const conversationDay = id.match(/^d(\d+)-approach$/);
  const dateDay = id.match(/^d(\d+)-date-choice-[ab]$/);
  if (dateDay) {
    const day = Number(dateDay[1]);
    a.dateTarget = day === 13 ? values.mutualTarget : values["date" + day];
    const route =
      day === 13 && values.mutualSuccess !== "true"
        ? undefined
        : dateRoute(work, state, day, a.dateTarget, c.p.ex);
    if (route) {
      const choice = (id.endsWith("-a") ? route.choicesA : route.choicesB)[
        a.optionIndex!
      ];
      if (!choice) return undefined;
      Object.assign(a, {
        characterDate: true,
        dateVersion: 2,
        sceneEffect: choice.effect,
        dateReply: choice.result,
        dateMiddle: route.middle,
        dateQuestion: id.endsWith("-a") ? route.questionA : route.questionB,
      });
    }
  }
  if (conversationDay) {
    const chosenFocus = answer(state, `d${conversationDay[1]}-focus`);
    a.exBranch = chosenFocus === c.p.ex;
    const next: Runtime = {
      ...state,
      ui: {
        ...state.ui,
        kakao: { ...state.ui?.kakao, ["answer:" + id]: JSON.stringify(a) },
      },
    };
    const focus = answer(state, `d${conversationDay[1]}-focus`);
    const r = relationships(
      work,
      next,
      c.p,
      c.config,
      Number(conversationDay[1]),
    )[focus];
    if (r) a.reaction = { meetings: r.meetings, pressure: r.pressure };
  }
  const smsDay = id.match(/^d(\d+)-sms$/);
  if (smsDay) {
    const day = Number(smsDay[1]);
    const target = selected(state, `d${day}-recipient`);
    if (!residentCast(c.p, c.config, day).men.includes(target))
      return undefined;
    const options = smsChoices(work, state, c.p, c.config, day);
    const choice = options.find((row) => row.text === a.value);
    if (!choice) return undefined;
    Object.assign(a, {
      smsVersion: 2,
      smsIntent: choice.intent,
      smsOptions: options.map((row) => row.text),
      smsEffect: smsEffect(
        choice.intent,
        smsContext(work, state, target, day, c.p.ex),
      ),
    });
    a.votes = nightlyVotes(
      work,
      c.p,
      c.config,
      state,
      Number(smsDay[1]),
      a.value,
    );
  }
  return JSON.stringify(a);
}
export function seasonValues(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
): Record<string, string> {
  const pairs = pairsFor(p, config),
    cast = castFor(p, config);
  const other = cast.presentMen.find((m) => m !== p.ex)!;
  const reasonIndex = config.reasons.indexOf(p.reason);
  let backstory: Record<string, string> = {};
  try {
    backstory = JSON.parse(
      work.data.notes.find((i) => i.meta.profileForm)!.meta[
        "backstory" + reasonIndex
      ],
    );
  } catch {
    /* Blank authoring preview. */
  }
  const values: Record<string, string> = {
    player: p.name,
    mbti: p.mbti || "INFP",
    other,
    reason: p.reason,
    opening: "你把目光放回自己面前的杯子，暫時沒有追著任何人看。",
    letter: backstory.receivedLetter || "",
    selfLetter: backstory.selfLetter || "",
    preMeeting:
      (backstory.preMeeting || "") + "\n\n" + (backstory.privateRecall || ""),
    privateRecall: backstory.privateRecall || "",
    giftMemory: backstory.giftMemory || "",
    q3: backstory.q3 || "這次你最希望自己學會怎麼表達需要？",
    q3Options:
      backstory.q3Options ||
      JSON.stringify([
        "我想把沒講完的話說清楚。",
        "我想先了解現在的自己。",
        "我還需要一點時間想。",
      ]),
    reunion: String(
      Math.max(
        0,
        Math.min(100, p.reunion + Number(state.variables.reunionDelta || 0)),
      ),
    ),
    newOptions: JSON.stringify(p.men.filter((m) => m !== p.ex)),
    giftOutcome:
      answer(state, "d1-gift") === "打開箱子"
        ? backstory.giftMemory ||
          "你打開箱子，裡面是你曾經提過的一本書。你把它放到床頭，沒有替對方的用意下定論。"
        : "你把箱子放在床頭，今晚先不拆開。這個決定不會被節目組解讀成拒絕或承諾。",
    xAtDinner: p.late
      ? "你擦完自己的餐具時，身旁的人問紙巾放在哪裡。你指了方向，沒有再看向門口。"
      : "擦桌子的人先把空碗排好，從頭到尾沒有和你對上視線。你也把注意力放在手上的菜葉。",
  };
  for (const [key, raw] of Object.entries(state.ui?.kakao || {})) {
    if (key.startsWith("answer:")) {
      try {
        values["answer_" + key.slice(7).replaceAll("-", "_")] = JSON.parse(
          String(raw),
        ).value;
      } catch {
        /* Non-answer UI state. */
      }
    }
  }
  const roster = (() => {
    try {
      return JSON.parse(
        work.data.notes.find((i) => i.id === "sealed-roster")?.meta.roster ||
          "[]",
      ) as {
        name: string;
        age: number;
        job: string;
        mbti: string;
        bio: string;
      }[];
    } catch {
      return [];
    }
  })();
  for (let d = 0; d <= 21; d++) {
    const residents = residentCast(p, config, d);
    values["men" + d] = residents.men.join("、");
    values["women" + d] = residents.women.join("、");
    values["menOptions" + d] = JSON.stringify(residents.men);
    const daytime = residentCast(p, config, d === 3 ? 2 : d === 10 ? 9 : d);
    values["cook" + d] = [
      p.name,
      ...daytime.men.filter((m) => m !== p.ex).slice(d % 2, (d % 2) + 1),
      ...daytime.women.filter((w) => w !== p.name).slice(d % 3, (d % 3) + 1),
    ].join("、");
    const washers = [...daytime.men, ...daytime.women].filter(
      (n) => !values["cook" + d].split("、").includes(n),
    );
    values["wash" + d] = washers.slice(0, 3).join("、");
    const eventPool = [
      "公共廚房少了一種調味料，大家先確認替代的作法，沒有把問題推給一個人。",
      "你在公共空間碰見兩位嘉賓討論各自喜歡的音樂，聽完後才決定要不要加入。",
      "有人提醒今天的垃圾分類需要重做。你先把自己那一袋分好，讓其他人照原來的步調完成。",
      "一場短雨改變了散步的安排，大家重新確認自己想留下還是出門，沒有誰必須跟著誰。",
      "你看見一位嘉賓把早餐留好，但不知道那份照顧是不是特別的意思，先沒有替對方下結論。",
      "回程時有人記錯路，大家一起看指標，輪流說自己的判斷；你留意到意見不同時對方如何聽人說話。",
    ];
    values["dailyEvent" + d] =
      eventPool[
        Math.floor(rank(p, "daily-event", d, p.name, "") * eventPool.length)
      ];
    const friends = residents.women.filter((w) => w !== p.name);
    values["woman" + d] = friends[d % friends.length];
    values["quiet" + d] = residents.men.filter((m) => m !== p.ex)[
      d % (residents.men.length - Number(residents.men.includes(p.ex)))
    ];
    values["publicRoster" + d] = [...residents.men, ...residents.women]
      .map((name) => {
        if (name === p.name)
          return (
            `${name}｜${p.mbti || "INFP"}` +
            (d >= 7
              ? "｜26 歲｜" + (reasonIndex === 1 ? "在韓攻讀博士" : "研究助理")
              : "")
          );
        const r = roster.find((r) => r.name === name);
        return (
          `${name}｜${r?.mbti || "ISFJ"}` +
          (d >= 7 ? `｜${r?.age || 27} 歲｜${r?.job || "企劃"}` : "")
        );
      })
      .join("\n");
    const votes = storedVotes(state, d);
    if (votes) {
      const received = votes.filter((v) => v.to === p.name);
      values["sms" + d] = received.length
        ? received.map((v, i) => `匿名訊息 ${i + 1}\n${v.text}`).join("\n\n")
        : "沒有嘉賓選擇您。";
      const moment = momentFor(work, state, p, config, d);
      const commonClue = moment?.sharedClue;
      if (
        commonClue &&
        received.some(
          (v) => v.text === commonClue || v.text === moment?.sharedClueB,
        )
      )
        values["sms" + d] +=
          "\n\n那句話提到的，是幾個人都在場的小事。你看向客廳，還沒辦法只靠這個細節替短信署名。";
      const xVote = votes.find((v) => v.from === p.ex);
      values["hint" + d] =
        d >= 14
          ? `你的前任選擇了 ${xVote?.to || "今晚未參與收發"}。`
          : xVote?.to === p.name
            ? "你的 X 選擇了你。"
            : "你的 X 沒有選擇你。";
    } else {
      values["sms" + d] = "等待所有嘉賓完成發送。";
      values["hint" + d] = "收件完成後才會顯示提示。";
    }
    const answer1 = answer(state, `d${d}-i1`),
      answer2 = answer(state, `d${d}-i2`);
    values["journal" + d] =
      `今天你留下的回答：\n${answer1 || "尚未作答"}\n\n${answer2 || "尚未作答"}`;
  }
  const matches2 = dateMatches(p, config, state, 2),
    matches3 = dateMatches(p, config, state, 3);
  values.date2 = matches2[p.name];
  values.date3 = matches3[p.name];
  values.dateOptions2 = JSON.stringify(
    cast.presentMen.filter((m) => m !== p.ex),
  );
  values.dateOutcome2 =
    values.date2 === answer(state, "d2-date")
      ? `節目組只通知你：本次約會對象是 ${values.date2}。`
      : `有邀請重複，經對方反選與未配對名額調整後，節目組只通知你：本次約會對象是 ${values.date2}。`;
  const likes = [
    "不太甜的拿鐵",
    "河邊慢慢散步",
    "小型唱片行",
    "安靜的展覽",
    "熱湯和麵包",
  ];
  const taste =
    likes[
      Math.floor(rank(p, "advice", 2, values.date2, "like") * likes.length)
    ];
  const stance = rank(p, "advice-stance", 2, values.date2, p.name);
  values.anonAdvice =
    stance > 0.75
      ? "「我能告訴你的不多。我們相處的時間和現在也許不一樣，與其照我的經驗安排，不如先直接問他想怎麼度過這一天。希望你們都能自在。」"
      : `「${stance < 0.2 ? likes[(likes.indexOf(taste) + 1) % likes.length] : taste} 可以當成一個參考。他不太喜歡被催著說感受。這是我知道的那一部分，現在的他也許不一樣，你還是直接問他比較好。」`;
  values.datePreference2 = `你直接問起偏好，${values.date2} 想了一下，說自己最近比較喜歡 ${taste}。你把眼前的回答當作今天新知道的一件事，沒有替另一個人的資訊下定論。`;
  try {
    const relations = JSON.parse(
      work.data.notes.find((i) => i.id === "sealed-roster")?.meta
        .relationships || "[]",
    ) as { woman: string; reply: string }[];
    const dateWoman = pairs.find((r) => r.man === values.date2)?.woman;
    if (stance <= 0.75)
      values.anonAdvice +=
        "\n\n「" +
        (relations.find((r) => r.woman === dateWoman)?.reply ||
          "你還是直接問他會比較好。") +
        "」";
  } catch {
    /* No additional relationship material in blank previews. */
  }
  const tasks = [
    "不直接要求，讓對方在約會中自然說出『我很開心』。",
    "不提及前任，了解對方上一段關係的時長；對方不願回答時尊重界線。",
    "請和約會對象拍一張兩人都不看鏡頭的合照，只交給節目組。",
    "主動說出自己一個會影響相處的缺點。",
    "請對方替你選一杯飲料，並說明理由。",
    "自然提起自己喜歡的季節，再問對方喜歡哪個季節。",
    "不用手機，畫一張所在場景的簡圖送給對方。",
    "問對方：你覺得自己戀愛時更像哪種動物？",
    "約會結束時，用三個不涉及外貌的詞形容對方。",
    "分享一件你願意公開、以前很少說的小事；不必揭露隱私。",
  ];
  values.task =
    tasks[Math.floor(rank(p, "task-card", 2, p.name, "task") * tasks.length)];
  values.taskResult = answer(state, "d3-task")
    ? "節目組核對後記錄任務完成，你把任務卡交回。"
    : "任務尚未完成。節目組保留任務環節，你可以換一種尊重界線的方式再試；尚不能進入其他自由活動。";
  values.femaleArrival = cast.female;
  values.maleArrival = cast.male;
  const fInfo = roster.find((r) => r.name === cast.female),
    mInfo = roster.find((r) => r.name === cast.male);
  values.femaleInfo3 = `${cast.female}｜${fInfo?.mbti || "ISFJ"}`;
  values.maleInfo10 = `${cast.male}｜${mInfo?.mbti || "INFJ"}｜${mInfo?.age || 27} 歲｜${mInfo?.job || "企劃"}`;
  const wantsRoom = answer(state, "d7-room") === "進入";
  const xWantsRoom = p.late
    ? !wantsRoom
    : rank(p, "room-intent", 7, p.ex, "room") > 0.35;
  values.roomOptions = JSON.stringify(
    wantsRoom && xWantsRoom
      ? ["我進入，對方留在外面", "由對方進入，我留在外面"]
      : ["確認這個環節的安排"],
  );
  values.roomOutcome =
    wantsRoom && xWantsRoom
      ? "節目組告知雙方都提出進入意願，需要先協商由誰進入；對方還未入住時，協商安排在獨立的錄製空間，不會被其他嘉賓看見。"
      : wantsRoom
        ? "你提出進入意願，節目組告知這次不需要爭取另一個名額。"
        : "你選擇不進入。節目組不會把這個選擇直接解讀成放下。";
  const youEnter =
    wantsRoom &&
    (!xWantsRoom ||
      answer(state, "d7-allocation") !== "由對方進入，我留在外面");
  values.roomConversation = youEnter
    ? "協商完成後，你在限時內進入房間。物品只和你自己的這段關係有關，沒有其他嘉賓的資料。你看見一張留過折痕的便條，沒有急著替它找一個必須回頭的解釋。"
    : "你留在外面。節目組不向你轉述房間裡的表情，也不要求你用同一種方式面對回憶。";
  values.roomDate =
    wantsRoom || xWantsRoom
      ? `節目組安排的不公開見面，在離小屋一段路的茶室。你到的時候，桌上沒有點好的飲料，對方把菜單留在中間，等你自己選。你們都知道今天為什麼來，卻先問了一句路上順不順，像需要那一點很普通的對話，才能真的坐下。\n\n${youEnter ? "你剛從回憶房間出來，看到眼前的人，才發現自己記住的不是物品值多少，而是當時以為還會有很多次的普通日子。" : "你沒有進入房間，也不向對方索取裡面的反應。你只問現在願不願意坐著說一會兒，讓今天的你也有機會被聽見。"}\n\n${values.privateRecall}\n\n茶送來時，對方先問你要不要加水，沒有照以前的習慣直接動手。「以前我總覺得我們應該懂，」他說，「有時候連問都省了。」你聽出那不是一句可以補完所有問題的道歉。他把杯子移開一點，留出桌上的空處，問你這幾天有沒有哪個瞬間，想說話卻忍住了。\n\n錄製時間快結束時，工作人員在門外提醒。你們沒有用一個擁抱假裝所有話都談完。六點前你回到小屋，對方由不同通道離場；未入住者不會提前進屋。沒有說清楚的事，節目組會在晚間正式談話時留給你逐題表達。`
      : "你們這次都沒有進入，沒有啟動秘密約會。下午你在公共空間完成自己的輪值，不追問別人的行程。";
  const giftOptions = [
    "A｜一張手繪地圖",
    "B｜一本有折角的書",
    "C｜一小盒茶",
    "D｜一張唱片",
    "E｜一只素色杯子",
  ];
  values.giftOptions = JSON.stringify(giftOptions);
  const giftIndex = Math.max(0, giftOptions.indexOf(answer(state, "d10-gift")));
  const giftMen = [...cast.presentMen].sort(
    (a, b) =>
      rank(p, "gift-owner", 10, b, "") - rank(p, "gift-owner", 10, a, ""),
  );
  const giftPrefs: Record<string, string> = {};
  for (const w of [p.name, ...config.women])
    giftPrefs[w] =
      w === p.name
        ? giftMen[giftIndex]
        : giftMen[Math.floor(rank(p, "gift-pick", 10, w, "") * 5)];
  const giftPairs: Record<string, string> = {};
  for (const m of giftMen) {
    const options = [p.name, ...config.women]
      .filter((w) => giftPrefs[w] === m)
      .sort(
        (a, b) =>
          rank(p, "gift-return", 10, m, b) - rank(p, "gift-return", 10, m, a),
      );
    if (options[0]) giftPairs[options[0]] = m;
  }
  for (const m of giftMen.filter(
    (m) => !Object.values(giftPairs).includes(m),
  )) {
    const next = [p.name, ...config.women]
      .filter((w) => !giftPairs[w])
      .sort(
        (a, b) =>
          rank(p, "gift-redraw", 10, m, b) - rank(p, "gift-redraw", 10, m, a),
      )[0];
    giftPairs[next] = m;
  }
  const extraWoman = [p.name, ...config.women].find((w) => !giftPairs[w])!;
  giftPairs[extraWoman] = cast.male;
  values.date10 = giftPairs[p.name];
  values.newMaleCompanion = extraWoman === p.name ? "你" : extraWoman;
  values.giftDateOutcome =
    extraWoman === p.name
      ? "交換與補抽結束後，你仍是尚未互選成功的人。節目組為你安排另一段約會；見面的人此前沒有在小屋出現。"
      : `交換與補抽結束後，節目組確認你與 ${values.date10} 抽到了彼此準備的禮物。其他人的未配對行程，不向你提前透露。`;
  const mutualChoice = answer(state, "d13-mutual");
  const mutualBond = relationships(work, state, p, config, 12)[mutualChoice];
  const mutualSuccess =
    !!mutualBond &&
    mutualBond.meetings >= 2 &&
    interest(mutualBond) > rivalInterest(p, config, mutualChoice, 13);
  values.mutualOutcome = mutualSuccess
    ? `你與 ${mutualChoice} 互選成功，一同完成半日行程，五點前回到小屋。`
    : "節目組通知你沒有互選成功。你留在小屋，不得知其他人的單向選擇，也不替對方解釋原因。";
  values.mutualSuccess = String(mutualSuccess);
  values.mutualTarget = mutualSuccess ? mutualChoice : "";
  values.dateVisibility10 = values.date10 === p.ex ? "player" : "public";
  values.dateVisibility13 =
    mutualSuccess && mutualChoice === p.ex ? "player" : "public";
  const travelPreferred: Record<string, string> = {};
  for (const w of [p.name, ...config.women])
    travelPreferred[w] =
      w === p.name
        ? answer(state, "d13-travel") || p.men[0]
        : [...p.men].sort(
            (a, b) =>
              rank(p, "travel-choice", 13, w, b) -
              rank(p, "travel-choice", 13, w, a),
          )[0];
  const lockedTravel: Record<string, string> = {};
  for (const m of p.men) {
    const wantedWoman = [p.name, ...config.women].sort(
      (a, b) =>
        rank(p, "travel-male-choice", 13, m, b) -
        rank(p, "travel-male-choice", 13, m, a),
    )[0];
    if (travelPreferred[wantedWoman] === m) lockedTravel[wantedWoman] = m;
  }
  const remainingWomen = [p.name, ...config.women].filter(
    (w) => !lockedTravel[w],
  );
  const remainingMen = p.men.filter(
    (m) => !Object.values(lockedTravel).includes(m),
  );
  const travel = {
    ...lockedTravel,
    ...matchPairs(
      remainingMen,
      remainingWomen,
      {},
      () => true,
      (m, w) => rank(p, "travel-fallback", 13, m, w),
    ),
  };
  values.travelPartner = travel[p.name];
  values.flight = answer(state, "d14-flight") || "第一組";
  const flightMen = [...p.men].sort(
    (a, b) => rank(p, "flight", 14, b, "") - rank(p, "flight", 14, a, ""),
  );
  const flightWomen = [...config.women].sort(
    (a, b) => rank(p, "flight", 14, b, "") - rank(p, "flight", 14, a, ""),
  );
  const yourFlight = [p.name, ...flightWomen.slice(0, 2)],
    otherFlight = flightWomen.slice(2);
  values.flightRoster = `第一組：${flightMen.slice(0, 3).join("、")}；${(values.flight === "第一組" ? yourFlight : otherFlight).join("、")}。\n第二組：${flightMen.slice(3).join("、")}；${(values.flight === "第二組" ? yourFlight : otherFlight).join("、")}。`;
  values.revealPairs = pairs
    .map((r) =>
      r.woman === p.name && reasonIndex === 4
        ? `${r.woman} 與 ${r.man} 曾有一段沒有正式告白、後來結束的關係。`
        : r.woman === p.name && reasonIndex === 2
          ? `${r.woman} 與 ${r.man} 曾結婚，已離婚半年。`
          : `${r.woman} 與 ${r.man} 曾交往。`,
    )
    .join("\n");
  const selectedFinal = String(state.variables.finalRoute || "");
  if (selectedFinal === "reunion") {
    const result = finalConsent(work, state, p, config, p.ex);
    values.finalResult =
      (result.success
        ? "復合成功。你表達重新開始的心意，對方也選擇了你。"
        : "你選擇了復合，對方沒有接受重新開始。") + result.reason;
  } else
    values.finalResult =
      "你選擇先單身。你把珍惜與承諾分開，也把生活的重心留給自己。";
  const ownVotes = Array.from({ length: 21 }, (_, i) =>
    storedVotes(state, i + 1)?.find((v) => v.from === p.name),
  ).filter((v): v is Vote => !!v);
  const sentToX = ownVotes.filter((v) => v.to === p.ex).length;
  const newTarget = answer(state, "final-new-target");
  if (selectedFinal === "new" && newTarget) {
    const result = finalConsent(work, state, p, config, newTarget);
    values.finalResult =
      (result.success
        ? `換乘成功。你與 ${newTarget} 在終選時選擇了彼此。`
        : `你選擇了 ${newTarget}，對方沒有選擇開始新的關係。`) + result.reason;
  }
  values.endingJournal = `事前訪問裡，你曾選擇：${answer(state, "d0-q1") || "（尚未選擇）"}\n\n第一晚念完介紹信，你留下的話是：${answer(state, "d1-letter-feeling") || "（尚未選擇）"}。你對那只箱子的選擇是「${answer(state, "d1-gift") || "尚未選擇"}」，之後的心意沒有被這一個動作固定住。\n\n你先和 ${values.date2} 約會，又在下一個正式安排裡和 ${values.date3} 相處。回憶房間的意願是「${answer(state, "d7-room") || "尚未選擇"}」，而日本行的搭檔是 ${values.travelPartner}。這些是不同的環節，沒有哪一次配對直接替夜裡的短信作答。\n\n二十一晚，你寄給熟悉的人 ${sentToX} 次，也有 ${ownVotes.length - sentToX} 次把訊息交給其他人。次數是行動紀錄，不是誰愛得比較多的判決。\n\n最後一次談話，你說：${answer(state, "d21-chat2") || "（尚未選擇）"}\n\n${values.finalResult}\n\n節目結束後釋出的個別訪問裡，曾與你同桌的人說過：「我也在整理自己的過去，不是每一句照顧都有明確的暗示。」那些你沒有看見的停頓，有些來自對方自己的課題，並不都圍著你發生。這不會抹去你感到的委屈，也不要求你改變最後的決定。祝福你帶著自己的語言，繼續生活。`;
  Object.assign(values, daytimeValues(work, state, values));
  Object.assign(values, interactionValues(work, state, p, config));
  Object.assign(values, socialValues(work, state, p, config, values));
  Object.assign(values, dateValues(work, state, values));
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      String(v).replace(/\{\{(player|other)\}\}/g, (_, key) =>
        key === "player" ? p.name : other,
      ),
    ]),
  );
}
