/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};
declare const __APP_BUILD__: string;
const scope = new URL(self.registration.scope);
const cachePrefix = "foundphone-" + encodeURIComponent(scope.pathname);
const pages = new NetworkFirst({
  cacheName: cachePrefix + "-pages-v2",
  networkTimeoutSeconds: 4,
  fetchOptions: { cache: "no-store" },
  plugins: [new ExpirationPlugin({ maxEntries: 8 })],
});
const stories = new NetworkFirst({
  cacheName: cachePrefix + "-stories-v2",
  networkTimeoutSeconds: 4,
  fetchOptions: { cache: "no-store" },
  plugins: [new ExpirationPlugin({ maxEntries: 8 })],
});
// Register these before precaching, so an online reload does not prefer an old HTML/JSON copy.
registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" &&
    url.origin === scope.origin &&
    url.pathname.startsWith(scope.pathname),
  async ({ request, event }) => {
    try {
      return await pages.handle({ request, event });
    } catch {
      return (await matchPrecache("index.html")) || Response.error();
    }
  },
);
registerRoute(
  ({ url }) =>
    url.origin === scope.origin &&
    url.pathname.startsWith(scope.pathname) &&
    /\/(work|test-work|blank-work)\.json$/.test(url.pathname),
  async ({ request, event, url }) => {
    try {
      return await stories.handle({ request, event });
    } catch {
      return (
        (await matchPrecache(url.pathname.split("/").at(-1)!)) ||
        Response.error()
      );
    }
  },
);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
void self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        const url = new URL(client.url);
        if (
          url.origin !== scope.origin ||
          !url.pathname.startsWith(scope.pathname) ||
          url.searchParams.get("appRelease") === __APP_BUILD__
        )
          continue;
        url.searchParams.set("appRelease", __APP_BUILD__);
        // Do not await navigation inside activation: the navigation itself needs activation to finish.
        void client.navigate(url.href).catch(() => undefined);
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "FOUND_PHONE_CHECK_BUILD")
    event.source?.postMessage({
      type: "FOUND_PHONE_BUILD",
      build: __APP_BUILD__,
    });
});
