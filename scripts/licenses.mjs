import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
const root = JSON.parse(await readFile("package.json", "utf8"));
const visited = new Set();
const records = [];
async function visit(name, from = ".") {
  let dir = path.resolve(from, "node_modules", name);
  for (let current = path.resolve(from); ; current = path.dirname(current)) {
    try {
      await readFile(path.join(dir, "package.json"));
      break;
    } catch {
      if (current === path.dirname(current)) return;
      dir = path.join(path.dirname(current), "node_modules", name);
    }
  }
  const pkg = JSON.parse(
    await readFile(path.join(dir, "package.json"), "utf8"),
  );
  const key = pkg.name + "@" + pkg.version;
  if (visited.has(key)) return;
  visited.add(key);
  const licenseFiles = (await readdir(dir)).filter((f) =>
    /^(license|licence|copying|notice)(\.|$|-)/i.test(f),
  );
  let licenses = "";
  for (const f of licenseFiles) {
    try {
      licenses +=
        `\n--- ${f} ---\n` + (await readFile(path.join(dir, f), "utf8"));
    } catch {}
  }
  // OpenCC's bundled conversion dictionaries carry a separate Apache notice.
  if (pkg.name === "opencc-js") {
    licenses +=
      "\n--- LICENSES/Apache-2.0.txt ---\n" +
      (await readFile(path.join(dir, "LICENSES/Apache-2.0.txt"), "utf8"));
  }
  records.push({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    repository: pkg.repository,
    text:
      licenses ||
      "No license file found; inspect package metadata before redistribution.",
  });
  for (const dep of Object.keys(pkg.dependencies ?? {})) await visit(dep, dir);
}
for (const name of Object.keys(root.dependencies)) await visit(name);
records.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  "THIRD_PARTY_LICENSES.txt",
  records
    .map((r) => `${r.name}@${r.version}\nSPDX: ${r.license}\n${r.text}\n`)
    .join("\n========================================\n") +
    "\n\nAdapted iOS web components\n" +
    (await readFile("licenses/ios-web/chukjosh-MIT.txt", "utf8")) +
    "\n" +
    (await readFile("licenses/ios-web/homescreen-NOTICE.txt", "utf8")) +
    "\nAdapted Konsta Toggle — MIT\n" +
    (await readFile("licenses/konsta/MIT.txt", "utf8")),
);
await writeFile(
  "docs/dependency-licenses.json",
  JSON.stringify(
    records.map(({ text, ...r }) => r),
    null,
    2,
  ),
);
console.log(`Collected ${records.length} runtime package notices.`);

await writeFile(
  "THIRD_PARTY_LICENSES.txt",
  (await readFile("THIRD_PARTY_LICENSES.txt", "utf8"))
    .replaceAll("\r\n", "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd() + "\n",
);
