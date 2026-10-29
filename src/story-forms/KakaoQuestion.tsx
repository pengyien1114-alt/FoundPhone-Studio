import { useState } from "react";
import { Plus, Smile } from "lucide-react";
import type { Item, UiValue } from "../schema";
import { useChineseScript } from "./ChineseScript";
export function KakaoQuestion({
  item,
  onUi,
}: {
  item: Item;
  ui?: Record<string, UiValue>;
  onUi?: (key: string, value: UiValue) => void;
}) {
  const t = useChineseScript();
  const [opened, setOpened] = useState(false);
  let options: string[] = [];
  try {
    options = JSON.parse(item.meta.options || "[]");
  } catch {
    /* Invalid author data cannot create a free-text fallback. */
  }
  return (
    <>
      <div className="kzinp" aria-label="節目組作答">
        <Plus size={21} />
        <button
          type="button"
          className="kakao-choice-trigger"
          aria-label="KKT消息"
          aria-haspopup="dialog"
          aria-expanded={opened}
          onClick={() => setOpened(true)}
        >
          {t(item.meta.composerLabel || "输入消息 · 點此選擇回應")}
        </button>
        <Smile size={22} />
        <button aria-label="发送KKT消息" disabled>
          ↑
        </button>
      </div>
      {opened && (
        <div
          className="story-overlay kakao-options"
          role="dialog"
          aria-label="回答選項"
        >
          {item.meta.interactionWith && (
            <p className="kakao-interaction-context">
              {t(item.meta.interactionWith)}
            </p>
          )}
          <h3>{t(item.meta.choicePrompt || item.body.split("\n")[0])}</h3>
          {options.map((value) => (
            <button
              key={value}
              onClick={() => {
                setOpened(false);
                onUi?.("answer:" + item.id, value);
              }}
            >
              {t(value)}
            </button>
          ))}
          <button onClick={() => setOpened(false)}>{t("再想一下")}</button>
        </div>
      )}
    </>
  );
}
