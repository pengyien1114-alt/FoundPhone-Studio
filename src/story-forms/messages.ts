import type { Work, Runtime } from "../schema";
import type { Profile, ProfileConfig } from "./profile";
import { selected, seeded, publicPartner } from "./relationships";
import { savedAnswer } from "./answers";
import { approachIndex } from "./contacts";
import { momentFor, momentRecord } from "./encounters";

export type SmsIntent = "flirt" | "reach" | "probe" | "boundary";
export type SmsChoice = { text: string; intent: SmsIntent };
type Mode = "curious" | "familiar" | "close" | "tense" | "reconnect";
type Stage = "early" | "middle" | "late";
type Voice = {
  outgoing: Record<Mode, SmsChoice[]>;
  incoming: Record<Mode, string[]>;
};
type SmsBook = {
  version: 2;
  generic: Partial<Record<Mode | "ex" | "reach", SmsChoice[]>>;
  characters: Record<string, Voice>;
  exes: {
    outgoing: Record<Stage, SmsChoice[]>;
    incoming: Record<Stage, string[]>;
  }[];
  incoming: Partial<Record<Mode | "ex", string[]>>;
};
const books = new WeakMap<Work, SmsBook>();
export function smsBook(work: Work): SmsBook {
  const prior = books.get(work);
  if (prior) return prior;
  const raw = work.data.notes?.find((i) => i.id === "message-writing")?.body;
  const book = raw
    ? (JSON.parse(raw) as SmsBook)
    : ({
        version: 2 as const,
        generic: {},
        characters: {},
        exes: [],
        incoming: {},
      } as SmsBook);
  books.set(work, book);
  return book;
}
export type SmsContext = {
  mode: Mode;
  contacts: number;
  stage: Stage;
  returning: boolean;
};
export function smsContext(
  work: Work,
  state: Runtime,
  person: string,
  day: number,
  ex: string,
): SmsContext {
  const seen = new Set<number>();
  let lastSignal = 0;
  let contacted = false;
  let priorPick = "";
  let streak = 0;
  for (let d = 1; d <= day; d++) {
    const response = momentRecord(state, `d${d}-approach`);
    if (selected(state, `d${d}-focus`) === person && response) {
      seen.add(d);
      contacted = true;
      lastSignal =
        typeof response.sceneSignal === "number"
          ? response.sceneSignal
          : approachIndex(work, state, d) === 1
            ? -1
            : 1;
    }
    for (const turn of ["a", "b"]) {
      const date = savedAnswer(state, `d${d}-date-choice-${turn}`);
      if (date?.dateTarget === person) {
        seen.add(d);
        contacted = true;
        const effect = date.sceneEffect;
        if (effect)
          lastSignal =
            Number(effect.affinity || 0) -
            Math.max(0, Number(effect.pressure || 0));
      }
    }
    if (d < day) {
      const pick = selected(state, `d${d}-recipient`);
      if (pick === person) {
        streak++;
        priorPick = person;
      } else if (pick) {
        streak = 0;
        priorPick = pick;
      }
    }
  }
  const returning =
    Array.from({ length: Math.max(0, day - 2) }, (_, i) => i + 1).some(
      (d) => selected(state, `d${d}-recipient`) === person,
    ) &&
    !!priorPick &&
    priorPick !== person;
  const mode: Mode =
    contacted && lastSignal < 0
      ? "tense"
      : returning
        ? "reconnect"
        : seen.size >= 3 && streak >= 2
          ? "close"
          : person === ex || seen.size
            ? "familiar"
            : "curious";
  return {
    mode,
    contacts: seen.size,
    stage: day < 7 ? "early" : day < 14 ? "middle" : "late",
    returning,
  };
}
function previousMessages(state: Runtime, day: number) {
  const chosen = new Set<string>(),
    received = new Set<string>(),
    recent = new Set<string>();
  for (let d = 1; d < day; d++) {
    const record = savedAnswer(state, `d${d}-sms`);
    if (record?.value) chosen.add(record.value);
    for (const vote of record?.votes || []) received.add(vote.text);
    if (d >= day - 3)
      for (const text of record?.smsOptions || []) recent.add(text);
  }
  return { chosen, received, recent };
}
const shortMessage = (text: string) =>
  text.length <= 70 &&
  !/\{\{|今天那段|回來以後我又想到|\n|「.*」/.test(text) &&
  text.split(/[。！？!?]+/).filter((s) => s.trim()).length <= 2;
function ordered<T>(rows: T[], key: string, text: (row: T) => string) {
  return rows
    .map((row) => ({ row, rank: seeded(key + text(row)) }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.row);
}
export function smsChoices(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  day: number,
): SmsChoice[] {
  const to = selected(state, `d${day}-recipient`);
  const book = smsBook(work);
  // Future forms still need a valid preview, but have no recipient or history
  // to resolve. Do not regenerate 21 nights of imaginary letters per render.
  if (!to)
    return (["flirt", "probe", "boundary"] as const)
      .map((intent) =>
        book.generic.curious?.find((row) => row.intent === intent),
      )
      .filter((row): row is SmsChoice => !!row);
  const context = smsContext(work, state, to, day, p.ex);
  const history = previousMessages(state, day);
  const isEx = to === p.ex,
    voice = book.characters[to];
  const background = book.exes[Math.max(0, config.reasons.indexOf(p.reason))];
  const personal = isEx
    ? background?.outgoing[context.stage] || []
    : voice?.outgoing[context.mode] || [];
  const generic =
    book.generic[
      isEx && context.mode !== "tense" && context.mode !== "reconnect"
        ? "ex"
        : context.mode
    ] || [];
  // Deliberately provide different intentions, rather than three synonymous
  // thank-you notes. A rejected boundary never becomes a flirt on another night.
  const intentions: SmsIntent[] =
    isEx || ["tense", "reconnect"].includes(context.mode)
      ? ["reach", "probe", "boundary"]
      : ["flirt", "probe", "boundary"];
  const fallback = isEx
    ? []
    : [...(book.generic.curious || []), ...(book.generic.reach || [])];
  const pool = [...personal, ...generic, ...fallback];
  const result = intentions
    .map((intent) => {
      const eligible = pool.filter(
        (row) =>
          row.intent === intent &&
          shortMessage(row.text) &&
          !history.chosen.has(row.text),
      );
      const fresh = eligible.filter((row) => !history.recent.has(row.text));
      const options = fresh.length ? fresh : eligible;
      // Prefer the recipient's own language when it has not appeared recently.
      const own = options.filter((row) => personal.includes(row));
      const contextual = options.filter((row) => generic.includes(row));
      return ordered(
        own.length ? own : contextual.length ? contextual : options,
        `${p.seed}|sms2|${day}|${to}|${intent}|`,
        (row) => row.text,
      )[0];
    })
    .filter((row): row is SmsChoice => !!row);
  return ordered(
    result,
    `${p.seed}|sms-order|${day}|${to}|`,
    (row) => row.intent,
  );
}
export function outgoingSms(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  day: number,
  _facts: Record<string, string>,
): string[] {
  const recorded = savedAnswer(state, `d${day}-sms`);
  if (recorded?.smsVersion === 2 && recorded.smsOptions)
    return recorded.smsOptions;
  return smsChoices(work, state, p, config, day).map((row) => row.text);
}
export function smsEffect(intent: SmsIntent, context: SmsContext) {
  if (intent === "boundary") return { affinity: 0, clarity: 1, pressure: -1 };
  if (intent === "probe") return { affinity: 0, clarity: 1, pressure: 1 };
  if (intent === "flirt")
    return { affinity: 2, pressure: context.mode === "curious" ? 1 : 0 };
  return { affinity: 1, clarity: 1 };
}
export function incomingToPlayer(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  from: string,
  day: number,
): string {
  const book = smsBook(work),
    context = smsContext(work, state, from, day, p.ex);
  const history = previousMessages(state, day),
    voice = book.characters[from];
  const background = book.exes[Math.max(0, config.reasons.indexOf(p.reason))];
  const personal =
    from === p.ex
      ? background?.incoming[context.stage] || []
      : voice?.incoming[context.mode] || [];
  // A difficult conversation must not be followed by a disconnected promise
  // that everything is fine. Neither side knows the current anonymous ballot.
  const rows =
    context.mode === "tense"
      ? [...(voice?.incoming.tense || []), ...(book.incoming.tense || [])]
      : [
          ...personal,
          ...(voice?.incoming[context.mode] || []),
          ...(book.incoming[context.mode] || []),
          ...(from === p.ex ? book.incoming.ex || [] : []),
        ];
  const fresh = rows.filter(
    (text) => shortMessage(text) && !history.received.has(text),
  );
  const own = fresh.filter((text) => personal.includes(text));
  const choices = own.length ? own : fresh;
  const moment = momentFor(work, state, p, config, day);
  const shared =
    from === moment?.names.b ? moment?.sharedClueB : moment?.sharedClue;
  if (
    day % 7 === 4 &&
    moment &&
    [moment.names.a, moment.names.b].includes(from) &&
    shared &&
    shortMessage(shared) &&
    !history.received.has(shared) &&
    context.mode !== "tense"
  )
    return shared;
  return (
    ordered(
      choices.length ? choices : rows,
      `${p.seed}|incoming2|${day}|${from}|`,
      (text) => text,
    )[0] || "想再見你，先不找別的理由。"
  );
}
export function otherSms(
  work: Work,
  state: Runtime,
  p: Profile,
  config: ProfileConfig,
  from: string,
  to: string,
  day: number,
): string {
  const book = smsBook(work);
  const mode: Mode =
    day >= 8 &&
    (publicPartner(p, config, to) === from ||
      publicPartner(p, config, from) === to)
      ? "close"
      : day === 1
        ? "curious"
        : "familiar";
  const history = previousMessages(state, day);
  const rows = [
    ...(book.characters[from]?.incoming[mode] || []),
    ...(book.incoming[mode] || []),
  ];
  const fresh = rows.filter((text) => !history.received.has(text));
  return (
    ordered(
      fresh.length ? fresh : rows,
      `${p.seed}|npc-sms2|${day}|${from}|${to}|`,
      (text) => text,
    )[0] || "還想再跟你說幾句，沒找到機會。"
  );
}
