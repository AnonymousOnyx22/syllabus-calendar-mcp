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
}

interface Hit {
  index: number;
  length: number;
  value: string;
}

const MONTH_PATTERN =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

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
  return hits[0];
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
 * Pulls one dated event from each line of a syllabus that names a date.
 * A line with no date is not an event, so headings and notes are ignored.
 */
export function extractEvents(text: string, options: { course?: string; year?: number } = {}): ExtractResult {
  const year = options.year ?? new Date().getUTCFullYear();
  const fixedCourse = options.course?.trim() || null;
  const events: ExtractedEvent[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.replace(/[|\t]+/g, "  ").trim();
    line = line.replace(/^[>•*·]+\s*/, "").replace(/^\d+[.)]\s+/, "").replace(/^[-–—]\s+/, "");
    if (!line) continue;

    const date = findDate(line, year);
    if (!date) continue;

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
      notes: null,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "00:00").localeCompare(b.start_time ?? "00:00") || a.title.localeCompare(b.title));

  if (events.length === 0) {
    throw new Error(
      "No dated events found. Put one event on each line with a date, such as Assignment 1 due Sep 15, or Midterm exam on October 20, 2026 at 10:00.",
    );
  }

  return { events, count: events.length, year };
}

/** A short line for the text answer of extract_schedule_events. */
export function describeEvent(event: ExtractedEvent): string {
  const when = formatDate(event.date);
  const time = event.start_time ? ` at ${event.start_time}${event.end_time ? ` to ${event.end_time}` : ""}` : "";
  const course = event.course ? ` [${event.course}]` : "";
  return `${when}${time}: ${event.title} (${event.type})${course}`;
}
