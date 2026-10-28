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
  let replaceBuild = "";
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
      if (file === "sw.js" && replaceBuild) {
        res.setHeader("Content-Type", "application/javascript");
        res.end(
          readFileSync(resolve(dist, file), "utf8").replaceAll(
            replaceBuild,
            "fixture-next-release",
          ),
        );
        return;
      }
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
    await expect(page).toHaveTitle(work.title);
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
    // Updating a modern player in the middle of a draft must not relock,
    // navigate, dismiss the app, or erase the current unsent input.
    await page.getByRole("button", { name: "轻触解锁" }).click();
    for (const digit of work.phone.passcode)
      await page
        .getByRole("button", { name: "密码键" + digit, exact: true })
        .click();
    await page.getByRole("button", { name: "打开备忘录", exact: true }).click();
    await page
      .getByRole("button", { name: /01｜入住前的[秘祕]密備忘錄/ })
      .click();
    await page.getByRole("button", { name: "繁體中文", exact: true }).click();
    await page
      .getByRole("textbox", { name: "你的姓名", exact: true })
      .fill("不中斷的名字");
    const currentUrl = page.url();
    replaceBuild = new URL(currentUrl).searchParams.get("appRelease")!;
    await page.evaluate(async () => {
      const changed = new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
      await changed;
      await new Promise<void>((resolve) => {
        const receive = (event: MessageEvent) => {
          if (event.data?.build === "fixture-next-release") {
            navigator.serviceWorker.removeEventListener("message", receive);
            resolve();
          }
        };
        navigator.serviceWorker.addEventListener("message", receive);
        navigator.serviceWorker.controller!.postMessage({
          type: "FOUND_PHONE_CHECK_BUILD",
        });
      });
    });
    await expect(page).toHaveURL(currentUrl);
    await expect(
      page.getByRole("textbox", { name: "你的姓名", exact: true }),
    ).toHaveValue("不中斷的名字");
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
