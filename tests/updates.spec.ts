import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialRuntime } from "../src/schema";

test("a stale service worker upgrades its old page without erasing the player's save", async ({
  browser,
}) => {
  test.setTimeout(60000);
  let latest = false;
  const dist = resolve("dist");
  const work = JSON.parse(readFileSync(resolve(dist, "work.json"), "utf8"));
  let latestTitle = work.title;
  const oldHtml = `<!doctype html><html><body><p id="old">舊版快取</p><script>navigator.serviceWorker.register('./sw.js');</script></body></html>`;
  const oldWorker = `self.addEventListener('install',e=>e.waitUntil(caches.open('old-update-fixture').then(c=>c.addAll(['./index.html','./work.json'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.match('./index.html'));else if(new URL(e.request.url).pathname.endsWith('/work.json'))e.respondWith(caches.match('./work.json'));});`;
  const server = createServer((req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname.replace(
      /^\/upgrade\//,
      "",
    );
    res.setHeader("Cache-Control", "no-cache");
    if (!latest && (path === "" || path === "index.html")) {
      res.setHeader("Content-Type", "text/html");
      res.end(oldHtml);
      return;
    }
    if (!latest && path === "sw.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(oldWorker);
      return;
    }
    if (!latest && path === "work.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ...work, updatedAt: 5 }));
      return;
    }
    if (latest && path === "work.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ...work, title: latestTitle }));
      return;
    }
    const file = path || "index.html";
    if (file.includes("..")) {
      res.writeHead(400).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".html")
            ? "text/html"
            : file.endsWith(".json") || file.endsWith(".webmanifest")
              ? "application/json"
              : file.endsWith(".css")
                ? "text/css"
                : file.endsWith(".svg")
                  ? "image/svg+xml"
                  : "application/octet-stream",
      );
      res.end(readFileSync(resolve(dist, file)));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const context = await browser.newContext({ serviceWorkers: "allow" });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/upgrade/`);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const state = initialRuntime(work);
    state.ui = { notes: { "cache-probe": "保留這份存檔" } };
    await page.evaluate(async (saved) => {
      localStorage.setItem("update-probe", "保留這個設定");
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("foundphone-studio", 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          const works = db.createObjectStore("works", { keyPath: "id" });
          works.createIndex("updatedAt", "updatedAt");
          db.createObjectStore("saves", { keyPath: "id" });
        };
        open.onsuccess = () => {
          const tx = open.result.transaction("saves", "readwrite");
          tx.objectStore("saves").put({ id: saved.workId, state: saved });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    }, state);
    await page.reload();
    await expect(page.locator("#old")).toBeVisible();
    latest = true;
    // The old page still executes its old registration code. New activation must recover it.
    await page.reload();
    await expect(page.getByRole("button", { name: "轻触解锁" })).toBeVisible({
      timeout: 30000,
    });
    await expect(page).toHaveTitle(/二十一天/);
    await expect(page).toHaveURL(/appRelease=/);
    expect(
      await page.evaluate(() => localStorage.getItem("update-probe")),
    ).toBe("保留這個設定");
    const saved = await page.evaluate(
      async (id) =>
        new Promise<string>((resolve, reject) => {
          const open = indexedDB.open("foundphone-studio");
          open.onsuccess = () => {
            const get = open.result
              .transaction("saves")
              .objectStore("saves")
              .get(id);
            get.onsuccess = () => {
              resolve(get.result.state.ui.notes["cache-probe"]);
              open.result.close();
            };
            get.onerror = () => reject(get.error);
          };
        }),
      work.id,
    );
    expect(saved).toBe("保留這份存檔");
    // Once upgraded, a changed story at the same URL must beat the existing cached JSON.
    latestTitle = "二十一天 · 更新已驗證";
    await page.reload();
    await expect(page).toHaveTitle(/更新已驗證/);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "轻触解锁" })).toBeVisible();
    await expect(page).toHaveTitle(/更新已驗證/);
  } finally {
    await context.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
