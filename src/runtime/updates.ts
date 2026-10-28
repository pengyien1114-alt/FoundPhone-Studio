declare const __APP_BUILD__: string;
export const appBuild = __APP_BUILD__;
export function storyUrl(search: string, base: string) {
  const query = new URLSearchParams(search);
  const name =
    query.get("preview") === "test"
      ? "test-work.json"
      : query.get("template") === "blank"
        ? "blank-work.json"
        : "work.json";
  const url = new URL(name, base);
  // Also bypass the old service worker's exact precache route during the upgrade.
  url.searchParams.set("appBuild", appBuild);
  return url;
}
export function enableUpdates() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const page = new URL(location.href);
  page.searchParams.set("appRelease", appBuild);
  history.replaceState(history.state, "", page);
  const script = new URL("sw.js", document.baseURI);
  let stopped = false,
    lastCheck = 0;
  // Cache updates must never navigate a player out of a running scene.
  // New code and story data are loaded together on the next normal visit.
  const registration = navigator.serviceWorker
    .register(script, {
      scope: new URL(".", script).pathname,
      updateViaCache: "none",
    })
    .then((r) => {
      r.active?.postMessage({ type: "FOUND_PHONE_CHECK_BUILD" });
      return r;
    })
    .catch(() => undefined);
  const check = async () => {
    if (
      stopped ||
      document.visibilityState !== "visible" ||
      Date.now() - lastCheck < 15000
    )
      return;
    lastCheck = Date.now();
    const current = await registration;
    if (current) {
      current.active?.postMessage({ type: "FOUND_PHONE_CHECK_BUILD" });
      await current.update().catch(() => undefined);
    }
  };
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", check);
  const interval = window.setInterval(check, 60000);
  return () => {
    stopped = true;
    clearInterval(interval);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", check);
  };
}
