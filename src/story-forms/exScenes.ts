import type { Work } from "../schema";
import type { Profile, ProfileConfig } from "./profile";
export type ExScene = {
  opening: string;
  options: string[];
  replies: string[];
  ending: string;
};
export function exScene(
  work: Work,
  p: Profile,
  config: ProfileConfig,
  day: number,
): ExScene | undefined {
  const stage = day < 7 ? "early" : day < 14 ? "middle" : "late";
  try {
    return (
      JSON.parse(
        work.data.notes.find((i) => i.id === "relationship-rules")?.meta[
          `ex${config.reasons.indexOf(p.reason)}${stage}`
        ] || "null",
      ) || undefined
    );
  } catch {
    return undefined;
  }
}
export function exDetail(
  work: Work,
  p: Profile,
  config: ProfileConfig,
  key: string,
): string {
  return (
    work.data.notes.find((i) => i.id === "relationship-rules")?.meta[
      `ex${config.reasons.indexOf(p.reason)}${key}`
    ] || ""
  );
}
