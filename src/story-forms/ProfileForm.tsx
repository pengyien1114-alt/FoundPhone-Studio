import { useState } from "react";
import type { UiValue } from "../schema";
import { parseProfile, type Profile, type ProfileConfig } from "./profile";
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
      },
  );
  const change = (patch: Partial<Profile>) => {
    const next = { ...p, ...patch };
    setP(next);
    onUi?.("profileDraft", JSON.stringify(next));
  };
  const valid =
    p.name.trim().length > 0 &&
    p.men.length === 6 &&
    p.men.includes(p.ex) &&
    config.reasons.includes(p.reason);
  if (saved)
    return (
      <section className="story-profile">
        <p>
          設定已保存。請返回桌面，打開 X 閱讀第一天，再到 Safari 看
          theqoo、KakaoTalk 回覆節目組。
        </p>
        <p>
          {saved.name} · X：{saved.ex} · {saved.late ? "後期鯰魚" : "首日入住"}
        </p>
        <p>分手原因：{saved.reason}</p>
        <p>
          初始復合 {saved.reunion}% ／換乘 {100 - saved.reunion}%
        </p>
        <p>本輪設定已鎖定；完成第一天後可選擇重新開始。</p>
      </section>
    );
  return (
    <form
      className="story-profile"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          onUi?.("profile", JSON.stringify({ ...p, name: p.name.trim() }));
      }}
    >
      <label>
        你的姓名
        <input
          aria-label="你的姓名"
          maxLength={20}
          value={p.name}
          onChange={(e) => change({ name: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>男嘉賓（選擇六位，已選 {p.men.length}/6）</legend>
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
      <label>
        <input
          type="checkbox"
          checked={p.late}
          onChange={(e) => change({ late: e.target.checked })}
        />
        X 是後期登場的鯰魚
      </label>
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
      <label>
        初始復合傾向 {p.reunion}%
        <input
          aria-label="初始復合傾向"
          type="range"
          min="0"
          max="100"
          value={p.reunion}
          onChange={(e) => change({ reunion: Number(e.target.value) })}
        />
      </label>
      <p>初始換乘傾向 {100 - p.reunion}%</p>
      <button type="submit" disabled={!valid}>
        保存設定，開始第一天
      </button>
    </form>
  );
}
