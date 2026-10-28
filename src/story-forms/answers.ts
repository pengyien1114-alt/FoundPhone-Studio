import type { Runtime, UiValue } from "../schema";
export type SavedAnswer = {
  value?: string;
  target?: string;
  optionIndex?: number;
  sceneId?: string;
  sceneSignal?: number;
  sceneEffect?: Record<string, number>;
  sceneMeeting?: boolean;
  characterDate?: boolean;
  dateTarget?: string;
  exBranch?: boolean;
  votes?: { from: string; to: string; text: string }[];
};
const parsed = new WeakMap<
  Runtime,
  Map<string, { raw: UiValue | undefined; value: unknown }>
>();
// A render reads the same immutable recordings many times. Also detect in-place edits/imports.
export function savedAnswer<T = SavedAnswer>(
  state: Runtime,
  id: string,
): T | undefined {
  const raw = state.ui?.kakao?.["answer:" + id];
  let entries = parsed.get(state);
  if (!entries) {
    entries = new Map();
    parsed.set(state, entries);
  }
  const prior = entries.get(id);
  if (prior && prior.raw === raw) return prior.value as T | undefined;
  let value: unknown;
  try {
    const result = JSON.parse(String(raw || "null"));
    if (result && typeof result === "object" && !Array.isArray(result))
      value = result;
  } catch {
    /* An invalid or incomplete save is not a response. */
  }
  entries.set(id, { raw, value });
  return value as T | undefined;
}
