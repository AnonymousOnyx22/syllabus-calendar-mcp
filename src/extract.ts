import { formatDate, parseDateValue, parseTimeValue, type EventType } from "./calendar.js";

export interface ExtractedEvent {
  title: string;
  type: EventType;
  date: string;
  start_time: string | null;
  end_time: string | null;
  course: string | null;
  location: string | null;
  notes: string | null;
}

export interface ExtractResult {
  events: ExtractedEvent[];
  count: number;
  year: number;
  undated_lines: string[];
}

interface Hit {
  index: number;
  length: number;
  value: string;
  end?: string;
}

const MONTH_PATTERN =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

const WEEKDAY_PATTERN = "Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?";

/** Widens a date hit over a weekday name beside it and a range end after it, such as Mon Sep 14-18. */
function widenDate(text: string, hit: Hit, defaultYear: number): Hit {
  let index = hit.index;
  let length = hit.length;
  let end: string | undefined;

  const before = new RegExp(`\\b(?:${WEEKDAY_PATTERN})\\.?,?\\s+$`, "i").exec(text.slice(0, index));
  if (before) {
    index = before.index;
    length += hit.index - index;
  }

  const rest = text.slice(hit.index + hit.length);
  const weekdayAfter = new RegExp(`^\\s*\\(\\s*(?:${WEEKDAY_PATTERN})\\.?\\s*\\)`, "i").exec(rest);
  if (weekdayAfter) length += weekdayAfter[0].length;

  const tail = text.slice(index + length);
  const range = new RegExp(
    `^\\s*(?:-|–|—|to|through|until)\\s*((?:(?:${MONTH_PATTERN})\\.?\\s+)?\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?)(?!\\d|:\\d|/|\\s*[ap]\\.?m\\b)`,
    "i",
  ).exec(tail);
  if (range) {
    const hasMonth = new RegExp(`^(?:${MONTH_PATTERN})`, "i").test(range[1]);
    try {
      const day = String(parseInt(range[1], 10)).padStart(2, "0");
      const candidate = hasMonth ? parseDateValue(range[1], defaultYear) : parseDateValue(`${hit.value.slice(0, 8)}${day}`);
      if (candidate > hit.value) {
        end = candidate;
        length += range[0].length;
      }
    } catch {
      // The words after the dash are not a date, so the range is left out.
    }
  }

  return { index, length, value: hit.value, end };
}

function findDate(text: string, defaultYear: number): Hit | null {
  const patterns: RegExp[] = [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/,
    new RegExp(`\\b(?:${MONTH_PATTERN})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "i"),
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_PATTERN})\\.?(?:,?\\s+\\d{4})?\\b`, "i"),
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  ];

  const hits: Hit[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    try {
      const iso = parseDateValue(match[0], defaultYear);
      hits.push({ index: match.index, length: match[0].length, value: iso });
    } catch {
      // A date shaped token that is not a real date, such as Feb 30, is left alone.
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  return widenDate(text, hits[0], defaultYear);
}

function findTimes(text: string): Hit[] {
  const hits: Hit[] = [];
  const ampm = /\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?\b/gi;
  for (const match of text.matchAll(ampm)) {
    try {
      const value = parseTimeValue(match[0]);
      hits.push({ index: match.index ?? 0, length: match[0].length, value });
    } catch {
      // Not a time after all, so leave it in the title.
    }
  }

  const clock = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
  for (const match of text.matchAll(clock)) {
    const index = match.index ?? 0;
    if (hits.some((hit) => index >= hit.index && index < hit.index + hit.length)) continue;
    hits.push({ index, length: match[0].length, value: parseTimeValue(match[0]) });
  }

  return hits.sort((a, b) => a.index - b.index);
}

function stripRanges(text: string, ranges: { index: number; length: number }[]): string {
  let out = text;
  for (const range of [...ranges].sort((a, b) => b.index - a.index)) {
    out = `${out.slice(0, range.index)} ${out.slice(range.index + range.length)}`;
  }
  return out;
}

function cleanTitle(value: string): string {
  let title = value.replace(/\s+/g, " ").trim();
  title = title.replace(/\(\s*\)/g, " ");
  title = title.replace(/^[-,;:.|/\\\s]+/, "").replace(/[-,;:.|/\\\s]+$/, "");
  for (let i = 0; i < 3; i += 1) {
    const next = title
      .replace(/^(?:due(?:\s+(?:on|by))?|by|on|at|from|to|date|when|week)\s*[:\-]?\s*/i, "")
      .replace(/\s*(?:due(?:\s+(?:on|by))?|by|on|at|from|to|before|no later than|week)\s*[:\-]?\s*$/i, "");
    if (next === title) break;
    title = next.trim();
  }
  return title.replace(/^[-,;:.|/\\\s]+/, "").replace(/[-,;:.|/\\\s]+$/, "").replace(/\s+/g, " ").trim();
}

function classify(title: string): EventType {
  const text = title.toLowerCase();
  if (/\b(midterm|final exam|exam|test)\b/.test(text)) return "exam";
  if (/\bquiz\b/.test(text)) return "quiz";
  if (/\blab(?:oratory)?\b/.test(text)) return "lab";
  if (/\breading\b/.test(text)) return "reading";
  if (/\b(assignment|homework|problem set|essay|paper|report|project|presentation|discussion post)\b/.test(text)) return "assignment";
  if (/\b(class|lecture|seminar|tutorial|workshop)\b/.test(text)) return "class";
  return "other";
}

/**
 * Builds the hint shown when no dated events are found: lists the lines that
 * had no date and tells the user to add one, with an example.
 */
export function fixTheTextHint(undatedLines: string[]): string {
  if (undatedLines.length === 0) {
    return "Add a date to each line, such as Assignment 1 due Sep 15, or Midterm exam on October 20, 2026 at 10:00.";
  }
  const count = undatedLines.length;
  const label = count === 1 ? "line" : "lines";
  const listed = undatedLines.map((line) => `- ${line}`).join("\n");
  return `None of the ${count} ${label} named a date:\n${listed}\nAdd a date to each line, such as Sep 15 or October 20, 2026 at 10:00.`;
}

/**
 * Pulls one dated event from each line of a syllabus that names a date.
 * Lines with no date are collected in undated_lines, so they are not lost silently.
 */
export function extractEvents(text: string, options: { course?: string; year?: number } = {}): ExtractResult {
  const year = options.year ?? new Date().getUTCFullYear();
  const fixedCourse = options.course?.trim() || null;
  const events: ExtractedEvent[] = [];
  const undatedLines: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.replace(/[|\t]+/g, "  ").trim();
    line = line.replace(/^[>•*·]+\s*/, "").replace(/^\d+[.)]\s+/, "").replace(/^[-–—]\s+/, "");
    if (!line) continue;

    const date = findDate(line, year);
    if (!date) {
      undatedLines.push(line);
      continue;
    }

    const times = findTimes(line).filter((hit) => hit.index !== date.index);
    const withoutDate = stripRanges(line, [date, ...times]);
    let title = cleanTitle(withoutDate);

    let course = fixedCourse;
    const code = /^([A-Z]{2,6}\s?\d{2,4}[A-Z]?)\b\s*[:\-]?\s*/.exec(title);
    if (code) {
      course = course ?? code[1].replace(/\s+/g, " ").trim();
      title = title.slice(code[0].length).trim();
    }
    if (!title) continue;

    const start = times[0]?.value ?? null;
    const end = times[1]?.value ?? null;
    if (start && end && end <= start) {
      // A line that gives an end before a start is more likely a start and a note, so keep the first time.
      times.splice(1);
    }

    const key = `${date.value}|${start ?? ""}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      title,
      type: classify(title),
      date: date.value,
      start_time: start,
      end_time: start && end && end > start ? end : null,
      course,
      location: null,
      notes: date.end ? `Runs to ${date.end}.` : null,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "00:00").localeCompare(b.start_time ?? "00:00") || a.title.localeCompare(b.title));

  return { events, count: events.length, year, undated_lines: undatedLines };
}

/** A short line for the text answer of extract_schedule_events. */
export function describeEvent(event: ExtractedEvent): string {
  const when = formatDate(event.date);
  const time = event.start_time ? ` at ${event.start_time}${event.end_time ? ` to ${event.end_time}` : ""}` : "";
  const course = event.course ? ` [${event.course}]` : "";
  return `${when}${time}: ${event.title} (${event.type})${course}`;
}
