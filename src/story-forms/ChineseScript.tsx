import { createContext, useContext } from "react";
import { Converter } from "opencc-js";
import type { Item } from "../schema";

export type ChineseScript = "traditional" | "simplified";
export const ChineseScriptContext = createContext<ChineseScript | undefined>(
  undefined,
);
export function parseScript(value: unknown): ChineseScript | undefined {
  return value === "traditional" || value === "simplified" ? value : undefined;
}
const converters = {
  traditional: Converter({ from: "cn", to: "t" }),
  simplified: Converter({ from: "t", to: "cn" }),
};
const unchanged = (text: string) => text;
const caches = {
  traditional: new Map<string, string>(),
  simplified: new Map<string, string>(),
};
const cached = (script: ChineseScript) => (text: string) => {
  const cache = caches[script];
  const prior = cache.get(text);
  if (prior !== undefined) return prior;
  const result = converters[script](text);
  if (cache.size >= 1500) cache.clear();
  cache.set(text, result);
  return result;
};
const translate = {
  traditional: cached("traditional"),
  simplified: cached("simplified"),
};
export function scriptConverter(script?: ChineseScript) {
  return script ? translate[script] : unchanged;
}
export function useChineseScript() {
  return scriptConverter(useContext(ChineseScriptContext));
}
// Convert presentation only. IDs, choice values, profile data and effects stay canonical.
export function displayStoryItem(
  item: Item,
  t: (text: string) => string,
): Item {
  return {
    ...item,
    title: t(item.title),
    body: t(item.body),
    sender: t(item.sender),
    comments: item.comments.map(t),
    meta: { ...item.meta, composerLabel: t(item.meta.composerLabel || "") },
  };
}
