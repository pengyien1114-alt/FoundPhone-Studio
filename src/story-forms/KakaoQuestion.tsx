import { useEffect, useState } from "react";
import type { Item, UiValue } from "../schema";
import { inputError } from "./season";
export function KakaoQuestion({
  item,
  ui,
  onUi,
}: {
  item: Item;
  ui?: Record<string, UiValue>;
  onUi?: (key: string, value: UiValue) => void;
}) {
  const [value, setValue] = useState(String(ui?.["draft:" + item.id] || ""));
  const [error, setError] = useState("");
  useEffect(() => {
    setValue(String(ui?.["draft:" + item.id] || ""));
    setError("");
  }, [item.id]);
  const change = (v: string) => {
    setValue(v);
    onUi?.("draft:" + item.id, v);
    setError("");
  };
  let options: string[] = [];
  try {
    options = JSON.parse(item.meta.options || "[]");
  } catch {
    /* Author validation reports malformed options. */
  }
  return (
    <form
      className="kzinp"
      aria-label="節目組作答"
      onSubmit={(e) => {
        e.preventDefault();
        const message = inputError(item, value);
        if (message) {
          setError(message);
          return;
        }
        onUi?.("answer:" + item.id, value);
      }}
    >
      {item.meta.form === "select" ? (
        <select
          aria-label="選擇回答"
          value={value}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">請選擇</option>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label="玩家輸入"
          placeholder="______（玩家輸入）"
          value={value}
          maxLength={Number(item.meta.maxLength || 1000)}
          onChange={(e) => change(e.target.value)}
        />
      )}
      <button
        className={value.trim() ? "go" : ""}
        aria-label="送出回答"
        disabled={!value.trim()}
      >
        ↑
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
