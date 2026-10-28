import type { Work, Runtime } from "../schema";
import { castFor, type Profile, type ProfileConfig } from "./profile";
import { selected } from "./relationships";
import { approachIndex } from "./contacts";
import { momentFor, momentRecord } from "./encounters";
function messages(work: Work, key: string): string[] {
  try {
    return JSON.parse(
      work.data.notes.find((i) => i.id === "message-writing")?.meta[key] ||
        "[]",
    );
  } catch {
    return [];
  }
}
export function outgoingSms(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  day: number,
  facts: Record<string, string>,
): string[] {
  const to = selected(state, `d${day}-recipient`),
    reason = Math.max(0, config.reasons.indexOf(p.reason));
  if (to === p.ex)
    return messages(
      work,
      `ex${reason}${day < 7 ? "early" : day < 14 ? "middle" : "late"}`,
    );
  const moment = momentFor(work, state, p, config, day);
  if (
    moment?.saved?.sceneId &&
    moment.target === to &&
    momentRecord(state, `d${day}-approach`)?.sceneId
  ) {
    return (moment.branch.sms || moment.scene.sms || []).map(moment.render);
  }
  if (day === 1) {
    const cast = castFor(p, config),
      men = cast.presentMen.filter((m) => m !== p.ex),
      quiet = men[1 % men.length];
    if (
      to === selected(state, "d1-focus") &&
      approachIndex(work, state, 1) === 1
    )
      return [
        "剛才有些問題問得太急了，不是要你第一天就給我一個以後。我只是發現自己很想聽你的想法。",
        "你說想慢一點，我有聽見。今天先把晚安寄過來，不追著問下一個答案。",
        "剛才那段話比我以為的難接，我回來後又想了一次。下次也想留一點空間聽你說。",
      ];
    if (to === selected(state, "d1-focus"))
      return [
        "剛才一起坐著的那幾分鐘，比我以為的自在。明天有空的話，想把沒聊完的話接下去。",
        "今天有點緊張，可能沒讓你看出來我其實很想繼續聊。先說一聲晚安。",
        "我還沒有想好這裡會發生什麼，但今天那段相處我有記住。謝謝你。",
      ];
    if (to === quiet)
      return [
        "剛才在廚房一起試味道的時候，緊張少了一點。下次也一起做飯吧。",
        "今天你等我說完口味才下醬，我有注意到。晚安。",
        "年糕比原本想的好吃，有一部分應該算我們配合得不錯。明天見。",
      ];
    if (selected(state, "d1-seat").includes(to))
      return [
        "剛進門不知道該坐哪裡的時候，謝謝你替我留了位置。明天想多和你聊一點。",
        "今天坐在你旁邊那一會兒，讓我沒有那麼像剛來的客人。晚安。",
        "我記得你今天接的那個玩笑，也記得後來自己沒那麼緊張了。明天見。",
      ];
    return [
      "今天一起吃飯時，我有幾次想接你的話，最後還是慢了一點。希望明天不只是叫得出名字。",
      "你今天說的一件小事，我回房間後還記得。明天有機會再聊吧。",
      "第一天能記住的事情不多，你是其中一個。晚安。",
    ];
  }
  const dated =
    day === 2
      ? facts.date2
      : day === 3
        ? facts.date3
        : day === 10
          ? facts.date10
          : "";
  if (to === dated)
    return [
      "今天回來的路比出發時自在，我有發現。下次想聽你把那段話說完。",
      "今天有一段安靜，我沒有急著找話題。原來和你待著也可以很自然。",
      "今天的行程結束了，但我還在想我們聊過的事。希望回到小屋後也能繼續。",
    ];
  if (to === selected(state, `d${day}-focus`)) {
    const index = approachIndex(work, state, day);
    return index === 1
      ? [
          "剛才有些問題問得太急了，不是想讓你立刻給答案。只是比我想像中更在意你的想法。",
          "今天的話我回來後又想了一次，也許有些不安不該都交給你。晚安。",
          "剛才氣氛有點僵，但我沒有後悔把在意說出來。之後也想聽你的步調。",
        ]
      : [
          day >= 14
            ? "今天在你面前不用假裝自己很確定，對我來說很重要。謝謝你還願意聽。"
            : "今天有一段話，我原本只打算說一半。和你坐下後，才發現自己還想說下去。",
          "想把明天的一小段時間也留給你，不只是今晚這封訊息。你有空的話，我會去問。",
          "有些開心不是當下很熱鬧，而是回來之後還會想到。今天和你聊天就是這樣。",
        ];
  }
  return day < 14
    ? [
        "今天沒能和你聊太久，但有留意你回來時的笑。明天想問問你今天過得怎樣。",
        "我還想多知道一點你沒有在大家面前說完的事。不是今晚一定要回答，先晚安。",
        "今天的心意先留在這封訊息裡。明天有機會的話，我會自己走過去。",
      ]
    : [
        "這幾天沒有每一段時間都留給你，但我知道今晚最想把話寄給誰。晚安。",
        "如果明天還能再聊一次，我想把自己的意思說得更清楚。今天先把這句留給你。",
        "有些期待變得很具體，卻還沒有到能輕易答應的時候。謝謝你讓我有時間想。",
      ];
}
export function incomingToPlayer(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  from: string,
  day: number,
): string {
  if (from === p.ex && selected(state, `d${day}-focus`) !== p.ex) {
    const unsaid = [
      "今天有幾次想問你要不要再坐一會兒，最後還是只說了和大家一樣的招呼。這封訊息想留一點不一樣的意思。",
      "有一句中文今天還沒敢當面說，不是因為沒有練過。想說的是晚安，也想說我沒有忘記。",
      "今天沒有什麼要補給你，只是還是想和你說一句晚安。不是要你給我同樣的回答。",
      "今天忍住沒有問你在看誰，卻還是想知道你回房間後會想起什麼。這次先把在意說成晚安。",
      "今天沒有替你決定什麼，還是有很多次想叫你的名字。這一封不是誰交代的。",
      "我今天有把自己的安排做好，也有想到你。想讓這兩件事都能留在同一個晚上。",
    ];
    return unsaid[Math.max(0, config.reasons.indexOf(p.reason))];
  }
  if (from === p.ex) {
    const rows = messages(
      work,
      `incoming${Math.max(0, config.reasons.indexOf(p.reason))}${day < 7 ? "early" : day < 14 ? "middle" : "late"}`,
    );
    return (
      rows[approachIndex(work, state, day) === 1 ? 1 : 0] ||
      "有些習慣比我以為的更難改。今天還是想和你說晚安。"
    );
  }
  const moment = momentFor(work, state, p, config, day);
  if (
    moment?.sharedClue &&
    [moment.names.a, moment.names.b].includes(from) &&
    day % 3 === 1
  )
    return from === moment.names.b ? moment.sharedClueB : moment.sharedClue;
  if (
    moment?.saved?.sceneId &&
    moment.target === from &&
    momentRecord(state, `d${day}-approach`)?.sceneId
  ) {
    return moment.render(
      (moment.branch.incoming || moment.scene.incoming || [])[
        approachIndex(work, state, day) === 1 ? 1 : 0
      ] || "剛才還有一點話想說。先晚安，明天見。",
    );
  }
  const cast = castFor(p, config),
    men = cast.presentMen.filter((m) => m !== p.ex),
    quiet = men[1 % men.length];
  if (day === 1 && from === quiet && selected(state, "d1-action"))
    return "今天在廚房本來有點緊張，後來忘記自己在緊張了。下次想把試味道以外的話也說完。";
  if (from === selected(state, `d${day}-focus`))
    return approachIndex(work, state, day) === 1
      ? "剛才沒能馬上回答，不代表沒有在想你說的話。我想照自己的步調把話說清楚。"
      : "今天坐下來之後，比原本打算的聊得久一點。如果明天也想聊，可以再來找我。";
  if (day === 1 && selected(state, "d1-seat").includes(from))
    return "剛進門那段安靜，後來想起來有點好笑。謝謝你願意接我的話，明天見。";
  return day === 1
    ? "今天同桌吃飯，聽見你笑的時候有想再和你說句話。明天想找個比較不慌的時機。"
    : "今天有幾個瞬間，我還想和你再聊聊。明天如果有空，一起坐一會兒吧。";
}
