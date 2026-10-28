import { z } from "zod";
import { useState, useEffect, useMemo } from "react";
import { workSchema, type Work } from "../schema";
export const widgetSchema = z.object({
  id: z
    .string()
    .regex(/^widget-[a-zA-Z0-9-]+$/)
    .max(80),
  type: z.enum(["calendar", "clock", "weather", "notes", "battery"]),
  size: z.enum(["small", "medium", "large"]),
});
export const layoutSchema = z
  .object({
    version: z.literal(1),
    workId: z.string(),
    previewLayoutRevision: z.number().int().min(0).default(0),
    storyLayoutRevision: z.number().int().min(0).default(0),
    apps: workSchema.shape.apps,
    widgets: z.array(widgetSchema).max(24),
    order: z.array(z.string().max(150)).max(500),
    cleared: z.array(z.string()).max(100),
    positions: z
      .record(
        z.string().max(150),
        z.object({
          page: z.number().int().min(0).max(19),
          x: z.number().int().min(0).max(3),
          y: z.number().int().min(0).max(5),
        }),
      )
      .default({}),
  })
  .strict();
export type DeviceLayout = z.infer<typeof layoutSchema>;
export type Widget = z.infer<typeof widgetSchema>;
export type AppConfig = Work["apps"][number];
export function ensureAppStore(work: Work): Work {
  return work.apps.some((a) => a.id === "appstore")
    ? work
    : {
        ...work,
        apps: [
          ...work.apps,
          {
            id: "appstore",
            name: "App Store",
            installed: true,
            visible: true,
            dock: false,
            folder: "",
            icon: "",
          },
        ],
      };
}
export function defaultLayout(input: Work): DeviceLayout {
  const w = ensureAppStore(input);
  const layout: DeviceLayout = {
    version: 1,
    workId: w.id,
    previewLayoutRevision: w.id === "ui-test-phone-v2" ? 1 : 0,
    storyLayoutRevision: 0,
    apps: structuredClone(w.apps)
      .sort((a, b) => (a.id === "appstore" ? -1 : b.id === "appstore" ? 1 : 0))
      .map((a) =>
        a.id === "appstore"
          ? { ...a, installed: true, visible: true, folder: "", dock: false }
          : a,
      ),
    widgets: [],
    order: [],
    cleared: [],
    positions: {},
  };
  arrangeStoryApps(layout, w);
  return layout;
}
function arrangeStoryApps(layout: DeviceLayout, work: Work) {
  const revision = Number(work.variables.homeLayoutRevision || 0);
  if (layout.storyLayoutRevision >= revision) return;
  const ids = String(work.variables.firstPageApps || "")
    .split(",")
    .filter(
      (id, i, all) =>
        layout.apps.some((a) => a.id === id) && all.indexOf(id) === i,
    )
    .slice(0, 4);
  for (const id of ids) {
    const app = layout.apps.find((a) => a.id === id)!;
    Object.assign(app, {
      installed: true,
      visible: true,
      dock: false,
      folder: "",
    });
    delete layout.positions[id];
  }
  // Move any item occupying the requested cells to the next free space, keeping the item itself.
  for (const cell of packHome(homeEntries(layout), layout.positions)[0]) {
    if (cell.y === 0 && cell.x < ids.length)
      delete layout.positions[cell.entry.key];
  }
  ids.forEach((id, x) => {
    layout.positions[id] = { page: 0, x, y: 0 };
  });
  layout.order = [...ids, ...layout.order.filter((id) => !ids.includes(id))];
  layout.storyLayoutRevision = revision;
}
export function validateLayout(raw: unknown, input: Work) {
  const w = ensureAppStore(input);
  const layout = layoutSchema.parse(raw);
  if (layout.workId !== w.id) throw Error("布局属于其他作品");
  const known = new Set(w.apps.map((a) => a.id));
  if (layout.apps.some((a) => !known.has(a.id))) throw Error("布局含未注册App");
  if (new Set(layout.apps.map((a) => a.id)).size !== layout.apps.length)
    throw Error("App ID重复");
  if (new Set(layout.widgets.map((a) => a.id)).size !== layout.widgets.length)
    throw Error("小组件ID重复");
  if (layout.apps.filter((a) => a.installed && a.visible && a.dock).length > 4)
    throw Error("Dock最多4个App");
  if (layout.widgets.some((w) => known.has(w.id)))
    throw Error("小组件与App ID冲突");
  layout.apps.push(
    ...w.apps.filter((a) => !layout.apps.some((b) => b.id === a.id)),
  );
  const store = layout.apps.find((a) => a.id === "appstore");
  if (store) {
    store.installed = true;
    store.visible = true;
    store.folder = "";
  }
  if (w.id === "ui-test-phone-v2" && layout.previewLayoutRevision < 1) {
    const visibleApps = ["wechat", "douyin"];
    for (const app of layout.apps) {
      if (
        visibleApps.includes(app.id) ||
        ["中国", "国内", "国际", "海外", "国内App", "国际App"].includes(
          app.folder,
        )
      ) {
        app.folder = "";
        delete layout.positions[app.id];
        if (visibleApps.includes(app.id)) {
          app.installed = true;
          app.visible = true;
          app.dock = false;
        }
      }
    }
    layout.order = [
      ...visibleApps,
      ...layout.order.filter((id) => !visibleApps.includes(id)),
    ];
    layout.previewLayoutRevision = 1;
  }
  arrangeStoryApps(layout, w);
  const entries = homeEntries(layout),
    packed = packHome(entries, layout.positions);
  for (const entry of entries) {
    const requested = layout.positions[entry.key];
    if (!requested) continue;
    const actual = packed[requested.page]?.find(
      (c) => c.entry.key === entry.key,
    );
    if (!actual || actual.x !== requested.x || actual.y !== requested.y)
      throw Error("桌面位置冲突或超出范围");
  }
  return layout;
}
export function useDeviceLayout(authored: Work, creator = false) {
  const base = useMemo(() => ensureAppStore(authored), [authored]);
  const key = "foundphone-layout-v1:" + base.id;
  const [stored, setStored] = useState(() => {
      try {
        const text = localStorage.getItem(key);
        return text
          ? validateLayout(JSON.parse(text), base)
          : defaultLayout(base);
      } catch {
        return defaultLayout(base);
      }
    }),
    [error, setError] = useState("");
  const layout = stored.workId === base.id ? stored : defaultLayout(base);
  useEffect(() => {
    if (creator) return;
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      setError("桌面布局保存失败，请检查本地存储空间");
    }
  }, [layout, key, creator]);
  const change = (fn: (draft: DeviceLayout) => void) =>
    setStored((old) => {
      const next = structuredClone(
        old.workId === base.id ? old : defaultLayout(base),
      );
      fn(next);
      return next;
    });
  const work = useMemo(() => {
    if (creator) return base;
    const known = new Map(base.apps.map((a) => [a.id, a]));
    const apps = [
      ...layout.apps.filter((a) => known.has(a.id)),
      ...base.apps.filter((a) => !layout.apps.some((b) => b.id === a.id)),
    ];
    return {
      ...base,
      apps,
      data: Object.fromEntries(
        Object.entries(base.data).map(([id, items]) => [
          id,
          layout.cleared.includes(id) ? [] : items,
        ]),
      ),
    };
  }, [base, creator, layout]);
  return {
    work,
    layout,
    error,
    change,
    importLayout: (raw: unknown) => setStored(validateLayout(raw, base)),
  };
}
export type HomeEntry = {
  key: string;
  kind: "app" | "folder" | "widget";
  app?: AppConfig;
  folder?: string;
  widget?: Widget;
};
export function homeEntries(layout: DeviceLayout): HomeEntry[] {
  const apps = layout.apps.filter((a) => a.installed && a.visible && !a.dock);
  const folders = [
    ...new Set(apps.filter((a) => a.folder).map((a) => a.folder)),
  ];
  const entries: HomeEntry[] = [
    ...apps
      .filter((a) => !a.folder)
      .map((app) => ({ key: app.id, kind: "app" as const, app })),
    ...folders.map((folder) => ({
      key: "folder:" + folder,
      kind: "folder" as const,
      folder,
    })),
    ...layout.widgets.map((widget) => ({
      key: widget.id,
      kind: "widget" as const,
      widget,
    })),
  ];
  return entries.sort((a, b) => {
    const x = layout.order.indexOf(a.key),
      y = layout.order.indexOf(b.key);
    return (x < 0 ? 999 : x) - (y < 0 ? 999 : y);
  });
}
export function packHome(
  entries: HomeEntry[],
  positions: DeviceLayout["positions"] = {},
) {
  type Cell = { entry: HomeEntry; x: number; y: number; w: number; h: number };
  const pages: Cell[][] = [[]],
    busy: boolean[][] = [Array(24).fill(false)],
    fixed = new Set<string>();
  const ensure = (n: number) => {
    while (pages.length <= n) {
      pages.push([]);
      busy.push(Array(24).fill(false));
    }
  };
  const size = (e: HomeEntry) => ({
    w: e.widget ? (e.widget.size === "small" ? 2 : 4) : 1,
    h: e.widget ? (e.widget.size === "large" ? 4 : 2) : 1,
  });
  const free = (page: number, x: number, y: number, w: number, h: number) => {
    if (x + w > 4 || y + h > 6) return false;
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        if (busy[page][(y + dy) * 4 + x + dx]) return false;
    return true;
  };
  const place = (
    e: HomeEntry,
    page: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) busy[page][(y + dy) * 4 + x + dx] = true;
    pages[page].push({ entry: e, x, y, w, h });
  };
  for (const e of entries) {
    const p = positions[e.key];
    if (!p) continue;
    ensure(p.page);
    const { w, h } = size(e);
    if (free(p.page, p.x, p.y, w, h)) {
      place(e, p.page, p.x, p.y, w, h);
      fixed.add(e.key);
    }
  }
  for (const e of entries) {
    if (fixed.has(e.key)) continue;
    const { w, h } = size(e);
    let done = false;
    for (let page = 0; page < pages.length && !done; page++)
      for (let y = 0; y <= 6 - h && !done; y++)
        for (let x = 0; x <= 4 - w && !done; x++)
          if (free(page, x, y, w, h)) {
            place(e, page, x, y, w, h);
            done = true;
          }
    if (!done) {
      ensure(pages.length);
      place(e, pages.length - 1, 0, 0, w, h);
    }
  }
  for (const page of pages)
    page.sort((a, b) => entries.indexOf(a.entry) - entries.indexOf(b.entry));
  return pages;
}
export function moveHome(layout: DeviceLayout, key: string, target: string) {
  const order = homeEntries(layout).map((e) => e.key);
  const from = order.indexOf(key),
    to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return;
  order.splice(from, 1);
  order.splice(to, 0, key);
  layout.order = order;
}
