import type { Runtime, Work } from "../schema";
import { castFor, type Profile, type ProfileConfig } from "./profile";
import { interactionValues as legacyValues } from "./legacyScenes";
import { encounterValues, momentFor } from "./encounters";
import { repairOptions, repairChoice, selected } from "./relationships";
export function interactionValues(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
): Record<string, string> {
  const values = legacyValues(work, state, p, config);
  for (const day of [7, 14, 19, 21])
    values[`repairOptions${day}`] = JSON.stringify(
      repairOptions(work, p, config, day),
    );
  for (const day of [7, 14, 19]) {
    const choice = selected(state, `d${day}-repair`);
    if (!choice) continue;
    const index = repairChoice(work, state, p, config, `d${day}-repair`);
    const reply =
      index === 0
        ? [
            "他聽完沒有立刻講以後，只很低地說，自己以前真的以為你會懂。你抬頭看他，他沒有移開眼睛，這次也沒有急著走。",
            "他把剛才沒講完的那句接回來，聲音比在大家面前小很多。你們沒有因為知道彼此還會難過，就把原來那些事全算了。",
            "他說自己也很怕又來一次，所以才一直不敢把想說成要。你聽見那個怕，這次沒有立刻問他到底選不選。",
          ][[7, 14, 19].indexOf(day)]
        : index === 1
          ? [
              "他說有，想過很多次。說完卻又問，如果回去以後還是一樣，你們是不是又會走散。你明明在想好的事，鼻子卻先酸了。",
              "他看著你，很久才說自己剛才也想起很多。可是影片停在那裡，生活不會真的停在那裡。你知道他講得對，還是很不想點頭。",
              "他說自己也會怕來不及，但不想只因為剩下的時間少了，就把你們以前怎麼分開全忘掉。你低著頭，這次沒有笑著說那算了。",
            ][[7, 14, 19].indexOf(day)]
          : "他點頭，沒有用你還願意坐在這裡，就當成你已經答應。你們停了一會兒，聽到門外有人走動，才各自把手邊的東西拿好。";
    values[`repairReply${day}`] = `你說：「${choice}」\n\n${reply}`;
  }
  const last = selected(state, "d21-chat1");
  if (last) {
    const index = repairChoice(work, state, p, config, "d21-chat1");
    values.finalTalkReply =
      index === 0
        ? "他回了很慢的一句：\n\n「我有聽見。這次我也會講，不會只等你先來。」\n\n下一個訊息隔了一會兒才亮起。\n「回去以後，你還想跟我試嗎？」"
        : index === 1
          ? "聊天室安靜了一會兒。\n\n「我也很想。」\n\n他停了很久，又補一則。\n「但我不想今天答應你，回去卻又讓你一個人等。」"
          : "他回覆：\n\n「我知道了。你不用因為我還想，就答應我。」\n\n過了一會兒，又出現一句：\n「謝謝你有直接跟我說。」";
  }
  for (let d = 1; d <= 21; d++) {
    const m = momentFor(work, state, p, config, d);
    if (m?.old) {
      values[`conversationWith${d}`] = values[`focus${d}`];
      values[`conversationPrompt${d}`] = "你想對他說什麼？";
      values[`encounterPeople${d}`] = (
        d >= 10 ? p.men : castFor(p, config).presentMen
      ).join("、");
      values[`encounterChoices${d}`] = JSON.stringify(
        d >= 10 ? p.men : castFor(p, config).presentMen,
      );
      values[`conversationQuestion${d}`] =
        `面對 ${values[`focus${d}`]}，還有哪句話沒說完？`;
      values[`encounterQuestion${d}`] = "你想先留在哪裡？";
      const item = work.data.twitter.find(
        (i) => i.meta.encounterDay === String(d),
      );
      const oldBody = item?.meta.legacyScene || "";
      values[`encounter${d}`] = oldBody.includes("【")
        ? oldBody.slice(oldBody.lastIndexOf("【"))
        : "";
      const oldComments = JSON.parse(
        work.data.twitter.find((i) => i.id === `d${d}-response`)?.meta
          .legacyComments || "[]",
      ) as string[];
      oldComments.forEach((text, index) => {
        values[`momentComment${d}_${index}`] = text;
      });
    }
  }
  return { ...values, ...encounterValues(work, state, p, config) };
}
