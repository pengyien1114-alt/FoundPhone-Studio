import { exScene, exDetail } from "./exScenes";
import type { Runtime, Work } from "../schema";
import { castFor, type Profile, type ProfileConfig } from "./profile";
import { selected, relationshipHistory, repairOptions } from "./relationships";
export function interactionValues(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
): Record<string, string> {
  const cast = castFor(p, config),
    present = cast.presentMen.filter((m) => m !== p.ex);
  const [a, b] = present,
    woman = cast.presentWomen[0];
  const values: Record<string, string> = {
    arrivalManA: a,
    arrivalManB: b,
    arrivalWoman: woman,
    roommateA: cast.presentWomen[0],
    roommateB: cast.presentWomen[1],
    repairOptions: JSON.stringify(repairOptions(work, p, config)),
    xAtDinner: exDetail(work, p, config, p.late ? "absent" : "ambient"),
    exLetterReaction: exDetail(work, p, config, "letterReaction"),
  };
  const introLines = [
    "把姓名牌立起來：「我怕你們等一下又忘了，可以隨時看這個。」",
    "把橘子倒進碗裡：「如果不知道說什麼，可以先吃一個。」",
    "坐下前先確認沒有擋住別人的路，才說：「叫我的名字就好，不用一直說不好意思。」",
    "承認自己練過兩遍開場，現在反而不知道下一句要說什麼。",
    "把行李放穩，先問大家要不要一起找廚房，而不是繼續乾坐著。",
  ];
  values.arrivalRollCall = [...cast.presentMen, ...cast.presentWomen]
    .filter((n) => ![a, b, woman].includes(n))
    .map((n, i) =>
      n === p.ex
        ? `${n} 把姓名牌放到桌上，只向大家作了簡短的介紹。${exDetail(work, p, config, "arrival")}`
        : `${n} ${introLines[i % introLines.length]}`,
    )
    .join("\n");
  const seat = selected(state, "d1-seat");
  values.seatResponse = seat.includes(a)
    ? `${a} 把手邊的靠墊拿開：「先說好，我剛才那句不算好笑，別對我期待太高。」你坐下時，他又小聲問行李有沒有卡壞輪子。`
    : seat.includes(woman)
      ? `${woman} 壓低聲音說：「我來的時候還叫錯一次名字，等一下如果你忘了，我們可以互相救一下。」你們笑了一下，剛才的客氣才真的鬆開。`
      : `${b} 把水放到你伸手就能拿到的地方：「剛才忘了問，你會介意靠窗冷嗎？」你說現在剛好，他便沒有再調整窗戶。`;
  const intro = selected(state, "d1-introduce");
  values.introduceResponse = intro
    ? `你說：「${intro}」\n${woman} 先點頭：「那等一下別只讓一個人負責找話題。」${a} 接著問你有沒有不吃的東西，另一邊也有人開始記晚餐的份量。你不再只是坐在沙發上的新名字。`
    : "";
  const kitchen = selected(state, "d1-action");
  const quiet = cast.presentMen.filter((m) => m !== p.ex)[1 % present.length];
  values.kitchenResponse = kitchen.includes("主動")
    ? `你問 ${quiet} 有沒有需要幫忙的地方。他先看了一眼砧板：「如果我切太慢，你可以直接說。」你接過旁邊的菜，他才坦白自己只是怕第一晚讓大家吃壞印象。${woman} 從水槽邊笑著說她已經聽見了，三個人一起決定先做一小鍋試味道。`
    : kitchen.includes("需要")
      ? `你說想先留一份不那麼辣的醬。${quiet} 停下手裡的動作，另外找了一只小碗：「剛才一直在討論大家吃什麼，忘了問你。」${woman} 沒有覺得麻煩，反而說這樣她那一份就可以多加辣。你們把差別放在桌上，事情反而簡單了。`
      : `你先把菜洗好、瀝乾，放到 ${quiet} 旁邊。起初沒有人說話，直到他拿錯兩個一樣的碗，你忍不住提醒。${woman} 笑說原來安靜的人都在看，他也笑了，問你願不願意幫忙看著鍋裡的年糕。`;
  const table = selected(state, "d1-table");
  values.tableResponse = table.includes("試味道")
    ? `你轉向 ${quiet} 問了那句。他停了一下：「一開始真的只是怕太辣。」${woman} 笑著問所以後來呢，他才看回你：「後來覺得一起做飯挺好，下次也可以。」你沒有替這句話接上更多意思，但接下來幾分鐘，你很難不記得那個停頓。`
    : table.includes("直接")
      ? `你說：「${table}」${b} 點點頭：「如果沒空卻沒說明白，可能比拒絕還難猜。」${woman} 說自己就是容易把沒空想成不想。你聽見桌子另一端有人輕輕接了一句「我也是」，卻還沒看清是誰。`
      : `你說：「${table}」${woman} 立刻笑著舉手，說自己也一樣。${a} 把杯子放下：「那如果兩個人都等，可能二十一天都不會出門。」你笑了，但也想起過去有幾次，確實只差一句直接的邀請。`;
  const history = relationshipHistory(work, state, p, config);
  for (let d = 1; d <= 21; d++) {
    const men = d >= 10 ? p.men : cast.presentMen;
    const focus = selected(state, `d${d}-focus`);
    const socialMen = men.filter((m) => m !== p.ex);
    values["focus" + d] = focus || "對方";
    values["sideMan" + d] = socialMen[(d + 1) % socialMen.length];
    const approach = selected(state, `d${d}-approach`),
      live = focus ? history[d][focus] : undefined;
    let r: { meetings: number; pressure: number } | undefined = live;
    try {
      r =
        JSON.parse(String(state.ui?.kakao?.[`answer:d${d}-approach`] || "null"))
          ?.reaction || live;
    } catch {
      /* Unsaved choice preview. */
    }
    const actor = work.data.notes.find((i) => i.id === "relationship-rules")
      ?.meta["actor" + config.men.indexOf(focus)];
    let actorInfo: { opening?: string; gentle?: string; guarded?: string } = {};
    try {
      actorInfo = JSON.parse(actor || "{}");
    } catch {
      /* Keep unassigned profiles quiet. */
    }
    const approachItem = work.data.kakao.find((i) => i.id === `d${d}-approach`);
    const legacyOptions = JSON.parse(
      approachItem?.meta.legacyOptions || approachItem?.meta.options || "[]",
    ) as string[];
    const personal = focus === p.ex ? exScene(work, p, config, d) : undefined;
    values["conversationOptions" + d] = JSON.stringify(
      personal?.options || legacyOptions,
    );
    let choiceIndex = legacyOptions.indexOf(approach);
    try {
      const record = JSON.parse(
        String(state.ui?.kakao?.[`answer:d${d}-approach`] || "null"),
      );
      if (Number.isInteger(record?.optionIndex))
        choiceIndex = record.optionIndex;
    } catch {
      /* Legacy plain answer. */
    }
    const first = choiceIndex === 0,
      press = choiceIndex === 1;
    const reply = press
      ? `他把杯子放到一旁：「${actorInfo.guarded || "我能說今天的感受，但現在還不能給你一個保證。"}」你看見他說完後沒有像剛才一樣繼續找話題。`
      : first
        ? `他想了幾秒，才接著說：「${actorInfo.gentle || "有些話我需要想一想，謝謝你沒有急著幫我說完。"}」`
        : `他點頭：「那今天先不把什麼事都講成答案。」你們聊了些輕鬆的事，他沒有繼續追問你的感情方向。`;
    const familiarity =
      !r || r.meetings < 3
        ? "這是你們還不熟悉彼此的說話節奏，卻願意把時間留下的一次。"
        : r.pressure > 10
          ? "你發現自己又把問題繞回了是否被選擇。他這次先說想回公共空間，你只能把還沒說完的話留到之後。"
          : "他接著問起你前幾天提過的小事。你原以為那句話沒有被記住，回答時才發現自己比剛坐下更放鬆。";
    const memory =
      focus === p.ex
        ? "某個熟悉的停頓又出現了。你知道自己可以順著舊習慣替他接話，這次卻多等了一會兒，讓他自己把句子說完。"
        : "你對他的了解還不多。有一兩個瞬間會讓你想到過去，但眼前這個人正用自己的方式回答，你試著不把兩段關係混在一起。";
    values["interaction" + d] =
      focus && approach
        ? `你先問 ${focus} 現在方不方便。他確認手上的分工已經結束，才和你坐到公共空間旁的長椅；兩個人都看得見屋裡，沒有躲開節目規定私下聯絡。\n\n${actorInfo.opening || "他先問你今天過得怎樣，等你坐穩才繼續。"}\n\n你說：「${approach}」\n${reply}\n\n${memory}\n\n${familiarity}\n\n${first ? "談到一半有人來找杯子，你們停了一下。等腳步聲走遠，他沒有立刻起身，而是問剛才說到哪裡。" : "屋裡傳來其他人商量早餐的聲音。你們把空杯帶回去，沒有替這次談話約定下一次。"}`
        : "";
    if (personal && approach) {
      const turn = personal.replies[choiceIndex] || personal.replies[0];
      const strain =
        r && r.pressure > 10
          ? "他說到一半就停了。你認得這個快要把話收回去的樣子；不是不熟，而是太清楚再多問一句可能會變成什麼。你這次聽見他說需要停一下，沒有把那句話立刻當成不在乎。"
          : r && r.meetings > 2
            ? "這不是你們第一次把這件事放回談話裡。你記得上一次停在哪裡，今天也沒有假裝那個停頓已經過去。熟悉讓你很想替他接話，卻也讓你更怕，又只剩自己把空白補完。"
            : "你不用重新介紹自己喜歡什麼，也不需要等三次見面才記住他的說話方式。最難的是你們都知道以前會怎麼接，今天卻還不確定能不能換一句。";
      values["interaction" + d] =
        `【錄製片段｜你的視角，未向其他嘉賓公開配對】\n\n你在公共空間旁等到 ${focus} 做完分工，才問能不能坐一會兒。你們沒有使用私人訊息聯絡，節目組也沒有向其他人說明這段談話的安排。\n\n${personal.opening}\n\n你說：「${approach}」\n${turn}\n\n${strain}\n\n${personal.ending}`;
    }
    values["discussion" + d] =
      focus && approach
        ? `31F 今天 ${focus} 跟 {{player}} 那段終於有完整對話了，${first ? "停下來等對方說完比一直找話題更讓我記得。" : press ? "但問到要不要給確定答案時，氣氛真的變了。" : "兩個人都把話留了一點，還看不出來之後怎樣。"}\n32F 我注意到 ${values["sideMan" + d]} 也有自己的相處線，不是每個人都在等同一個人。\n33F ${first ? "願意說自己不擅長什麼，是有往前一點。" : press ? "想要被確認可以理解，但另一個人的猶豫也是真的。" : "先輕鬆相處也好，只是如果一直不講清楚，後面可能錯過。"}\n34F 今天的短信要分開看，白天找誰聊天不等於晚上一定寄給誰。\n35F ${focus} 這次的停頓我有看到，先看下一集會不會主動接回這段。`
        : "";
    if (personal && approach && d < 14)
      values["discussion" + d] =
        `31F 今天 ${focus} 在公共空間那個停頓很明顯，但這集還沒有播出完整談話。\n32F 只看一個動作猜不出過去吧，我反而想看他接下來怎麼做。\n33F {{player}} 今天也有主動開口，沒有一直等別人來找。\n34F 沒公開的談話就先不要替他們填內容，短信也還是另一個環節。\n35F ${values["sideMan" + d]} 那邊也有自己的相處線，鏡頭切回飯桌時還在聊。`;
    const topics = [
      "今天在小屋裡",
      "吃過晚餐以後",
      "回到房間之前",
      "剛才收拾桌子的時候",
      "大家一起準備早餐時",
      "輪到洗碗的時候",
      "今天說起往後的生活時",
    ];
    values["smsOptions" + d] = JSON.stringify([
      `${topics[(d - 1) % topics.length]}，我發現自己有想再和你說話的念頭。明天有空的話，再聊一會兒吧。`,
      "今天有幾次我不太知道怎麼接話，但不是不想認識你。謝謝你給我一點時間。",
      "今天辛苦了。我的心意還在整理，但這封訊息是我自己想寄給你的。",
    ]);
    let repairReply = "";
    try {
      repairReply =
        JSON.parse(
          work.data.notes.find((i) => i.id === "relationship-rules")?.meta
            .repairReplies || "[]",
        )[config.reasons.indexOf(p.reason)] || "";
    } catch {
      /* No sealed background in blank stories. */
    }
    const repair = selected(state, `d${d}-repair`);
    const repairIndex = repairOptions(work, p, config).indexOf(repair);
    values["repairReply" + d] = repair
      ? `節目組安排的不公開談話裡，你說：「${repair}」\n\n${repairIndex === 0 ? repairReply + "你們把可以改變的事各說了一件，沒有只用想念把這段話結束。" : repairIndex === 1 ? "對方聽見你還在意，卻也問：「如果我們只是回到以前，下一次是不是還會一樣？」這句話之後，你們安靜了很久。" : "對方說知道了，沒有要求你留下承諾。你也沒有用安慰把剛說出的界線收回。"}\n\n談話在指定時間結束。回到小屋時，其他嘉賓已經各自做自己的事，節目組不公開這段談話的配對。`
      : "";
  }
  const last = selected(state, "d21-chat1");
  const repairIndex = repairOptions(work, p, config).indexOf(last);
  values.finalTalkReply =
    repairIndex === 0
      ? "對方看完後沒有立刻說復合，而是回覆：『如果我們又遇到同樣的情況，先照剛才談的做一次，不要各自猜。我也有要改的地方。你不用今天就替所有以後的事答應我。』\n\n接下來，輪到你表達節目結束後的界線。"
      : repairIndex === 1
        ? "對方停了一會兒才回覆：『我也記得好的事，但以前就是因為我們一直沒把問題說清楚，才走到後來。如果只是想回到以前，我還沒有準備好。』\n\n接下來，輪到你表達節目結束後的界線。"
        : "對方回覆：『我聽懂了。那我不會把你願意來談，當成你答應要重新開始。謝謝你直接跟我說。』\n\n接下來，輪到你表達節目結束後的界線。";
  return values;
}
