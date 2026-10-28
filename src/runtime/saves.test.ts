import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { initialRuntime } from "../schema";
import { createWork } from "../demo";
const io = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("../persistence", () => ({ db: { saves: io } }));
import { runtimeSaves } from "./saves";
const work = createWork(),
  key = "foundphone-progress-v1:" + work.id;
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.clearAllMocks();
  io.get.mockResolvedValue(undefined);
  io.put.mockResolvedValue(work.id);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, value: string) => values.set(k, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
test("a choice has a synchronous recovery copy before the database write completes", async () => {
  let finish!: () => void;
  io.put.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  const onFailure = vi.fn(),
    saves = runtimeSaves(work.id, onFailure);
  const state = initialRuntime(work);
  state.ui = { kakao: { "answer:d2-date": "saved choice" } };
  saves.save(state);
  expect(JSON.parse(values.get(key)!).state.ui.kakao["answer:d2-date"]).toBe(
    "saved choice",
  );
  // Simulate closing the tab while IndexedDB still contains an older save.
  io.get.mockResolvedValue({
    id: work.id,
    state: initialRuntime(work),
    savedAt: 1,
  });
  expect((await runtimeSaves(work.id, onFailure).load())?.state).toEqual(state);
  finish();
  await saves.flush();
  expect(onFailure).not.toHaveBeenCalled();
});
test("database writes remain ordered and coalesce rapid intermediate changes", async () => {
  let finish!: () => void;
  io.put.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  const saves = runtimeSaves(work.id, vi.fn());
  const a = initialRuntime(work),
    b = { ...a, time: "18:01" },
    c = { ...a, time: "18:02" };
  saves.save(a);
  saves.save(b);
  saves.save(c);
  expect(io.put).toHaveBeenCalledTimes(1);
  finish();
  await saves.flush();
  expect(io.put).toHaveBeenCalledTimes(2);
  expect(io.put.mock.calls[1][0].state.time).toBe("18:02");
  expect(io.put.mock.calls[1][0].savedAt).toBeGreaterThan(
    io.put.mock.calls[0][0].savedAt,
  );
});
test("a newer primary save beats an older backup", async () => {
  const state = initialRuntime(work);
  values.set(key, JSON.stringify({ id: work.id, state, savedAt: 1 }));
  const newest = {
    id: work.id,
    state: { ...state, time: "19:00" },
    savedAt: 2,
  };
  io.get.mockResolvedValue(newest);
  expect(await runtimeSaves(work.id, vi.fn()).load()).toEqual(newest);
});
test("a damaged backup cannot hide a valid legacy save", async () => {
  values.set(
    key,
    JSON.stringify({
      id: work.id,
      state: { workId: work.id, revision: 1 },
      savedAt: 999,
    }),
  );
  const legacy = { id: work.id, state: initialRuntime(work) };
  io.get.mockResolvedValue(legacy);
  expect(await runtimeSaves(work.id, vi.fn()).load()).toEqual(legacy);
});
test("database failure can still recover from the backup", async () => {
  const fail = vi.fn(),
    saves = runtimeSaves(work.id, fail),
    state = initialRuntime(work);
  io.put.mockRejectedValue(Error("storage blocked"));
  io.get.mockRejectedValue(Error("storage blocked"));
  saves.save(state);
  await saves.flush();
  expect((await runtimeSaves(work.id, fail).load())?.state).toEqual(state);
  expect(fail).not.toHaveBeenCalled();
});
test("backup denied still saves to IndexedDB; both denied reports the loss safely", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw Error("quota");
    },
  });
  const fail = vi.fn(),
    saves = runtimeSaves(work.id, fail);
  saves.save(initialRuntime(work));
  await saves.flush();
  expect(fail).not.toHaveBeenCalled();
  io.put.mockRejectedValue(Error("quota"));
  expect(() => saves.save(initialRuntime(work))).not.toThrow();
  await saves.flush();
  expect(fail).toHaveBeenCalledOnce();
});
