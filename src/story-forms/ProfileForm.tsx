import { useState } from "react";
import type { UiValue } from "../schema";
import {
  saveProfile,
  parseProfile,
  type Profile,
  type ProfileConfig,
} from "./profile";
import "./profile.css";
export function ProfileForm({
  config,
  ui,
  onUi,
}: {
  config: ProfileConfig;
  ui?: Record<string, UiValue>;
  onUi?: (key: string, value: UiValue) => void;
}) {
  const saved = parseProfile(ui?.profile);
  const [step, setStep] = useState(Number(ui?.profileStep || 0));
  const [p, setP] = useState<Profile>(
    () =>
      saved ||
      parseProfile(ui?.profileDraft, true) || {
        name: "",
        men: [],
        ex: "",
        late: false,
        reason: config.reasons[0],
        reunion: 50,
        mbti: "INFP",
      },
  );
  const change = (patch: Partial<Profile>) => {
    const next = { ...p, ...patch };
    setP(next);
    onUi?.("profileDraft", JSON.stringify(next));
  };
  const move = (value: number) => {
    setStep(value);
    onUi?.("profileStep", value);
  };
  if (saved)
    return (
      <section className="story-profile">
        <p>
          入住資料已封存。公開時機由節目流程決定，這裡不展示其他人的關係資料。
        </p>
        <p>
          {saved.name}｜{saved.mbti || "INFP"}
        </p>
        <p>
          請先閱讀備忘錄中的節目規則，再開啟 X 的事前採訪。節目組會透過對應 App
          通知下一步。
        </p>
      </section>
    );
  const allowed =
    step === 0
      ? !!p.name.trim()
      : step === 1
        ? p.men.length === 6
        : step === 2
          ? p.men.includes(p.ex)
          : true;
  const titles = [
    "你希望在節目裡使用什麼名字？",
    "請從七位男嘉賓中選擇六位。",
    "哪一位是你的前任？這份資料只交給節目組。",
    "你的前任是否安排在後續入場？",
    "你們是怎麼走到分開的？",
    "你目前比較想回頭，還是往前走？",
    "你的 MBTI 是什麼？",
  ];
  return (
    <form
      className="story-profile"
      onSubmit={(e) => {
        e.preventDefault();
        if (!allowed) return;
        if (step < 6) move(step + 1);
        else onUi?.("profile", JSON.stringify(saveProfile(p, config)));
      }}
    >
      <small>入住資料 {step + 1} / 7</small>
      <h2>{titles[step]}</h2>
      {step === 0 && (
        <label>
          你的姓名
          <select
            aria-label="你的姓名"
            value={p.name}
            onChange={(e) => change({ name: e.target.value })}
          >
            <option value="">請選擇</option>
            {["小雨", "知夏", "以寧", "若安", "予晴", "書棠"].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {step === 1 && (
        <fieldset>
          <legend>男嘉賓（已選 {p.men.length}/6）</legend>
          {config.men.map((name) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={p.men.includes(name)}
                disabled={p.men.length === 6 && !p.men.includes(name)}
                onChange={() => {
                  const men = p.men.includes(name)
                    ? p.men.filter((m) => m !== name)
                    : [...p.men, name];
                  change({ men, ex: men.includes(p.ex) ? p.ex : "" });
                }}
              />
              {name}
            </label>
          ))}
        </fieldset>
      )}
      {step === 2 && (
        <label>
          前任 X
          <select
            aria-label="前任 X"
            value={p.ex}
            onChange={(e) => change({ ex: e.target.value })}
          >
            <option value="">請選擇</option>
            {p.men.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}
      {step === 3 && (
        <label>
          <input
            type="checkbox"
            checked={p.late}
            onChange={(e) => change({ late: e.target.checked })}
          />
          安排於後續入場
        </label>
      )}
      {step === 4 && (
        <label>
          分手原因
          <select
            aria-label="分手原因"
            value={p.reason}
            onChange={(e) => change({ reason: e.target.value })}
          >
            {config.reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      )}
      {step === 5 && (
        <label>
          目前回頭的傾向 {p.reunion}%
          <input
            aria-label="初始復合傾向"
            type="range"
            min="0"
            max="100"
            value={p.reunion}
            onChange={(e) => change({ reunion: Number(e.target.value) })}
          />
        </label>
      )}
      {step === 6 && (
        <label>
          MBTI
          <select
            aria-label="MBTI"
            value={p.mbti || "INFP"}
            onChange={(e) => change({ mbti: e.target.value })}
          >
            {[
              "INTJ",
              "INTP",
              "ENTJ",
              "ENTP",
              "INFJ",
              "INFP",
              "ENFJ",
              "ENFP",
              "ISTJ",
              "ISFJ",
              "ESTJ",
              "ESFJ",
              "ISTP",
              "ISFP",
              "ESTP",
              "ESFP",
            ].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={!allowed}>
        {step === 6 ? "封存資料，閱讀節目規則" : "下一題"}
      </button>
      {step > 0 && (
        <button type="button" onClick={() => move(step - 1)}>
          上一題
        </button>
      )}
    </form>
  );
}
