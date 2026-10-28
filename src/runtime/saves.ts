import { db } from "../persistence";
import type { Runtime } from "../schema";

type Checkpoint = { id: string; state: Runtime; savedAt: number };
const keyFor = (id: string) => "foundphone-progress-v1:" + id;

// Only the small player state belongs here, never story media or the work.
function backup(id: string): Checkpoint | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(id)) || "null");
    const state = value?.state;
    if (
      value?.id === id &&
      Number.isFinite(value.savedAt) &&
      state?.workId === id &&
      Number.isFinite(state.revision) &&
      [
        "read",
        "visited",
        "completed",
        "unlocked",
        "trace",
        "choices",
        "endings",
        "notifications",
        "clues",
        "hidden",
      ].every((key) => Array.isArray(state[key])) &&
      state.variables &&
      typeof state.variables === "object" &&
      state.messages &&
      typeof state.messages === "object" &&
      typeof state.time === "string"
    )
      return value as Checkpoint;
  } catch {
    /* A blocked store or damaged backup must not interrupt play. */
  }
}

export function runtimeSaves(id: string, onFailure: () => void) {
  let pending: Checkpoint | undefined;
  let writing: Promise<void> | undefined;
  let lastTime = 0;
  const flush = (): Promise<void> => {
    if (writing) return writing;
    writing = (async () => {
      while (pending) {
        const value = pending;
        pending = undefined;
        try {
          await db.saves.put(value);
        } catch {
          if (backup(id)?.savedAt !== value.savedAt) onFailure();
        }
      }
    })().finally(() => {
      writing = undefined;
      if (pending) void flush();
    });
    return writing;
  };
  return {
    async load(): Promise<{ id: string; state: Runtime } | undefined> {
      let stored: (Checkpoint & { savedAt?: number }) | undefined;
      try {
        stored = (await db.saves.get(id)) as typeof stored;
      } catch {
        if (!backup(id)) onFailure();
      }
      const copy = backup(id);
      // Prefer a valid newer copy after an interrupted asynchronous IDB write.
      return copy && (!stored || copy.savedAt > (stored.savedAt || 0))
        ? copy
        : stored;
    },
    save(state: Runtime) {
      const value = { id, state, savedAt: Math.max(Date.now(), lastTime + 1) };
      lastTime = value.savedAt;
      try {
        localStorage.setItem(keyFor(id), JSON.stringify(value));
      } catch {
        /* IndexedDB remains the primary store when backup is unavailable. */
      }
      pending = value;
      void flush();
    },
    flush,
  };
}
