import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The kinds of dated item a syllabus usually names. */
export const EVENT_TYPES = ["assignment", "exam", "quiz", "lab", "reading", "class", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface ScheduleEvent {
  title: string;
  type?: EventType;
  /** A date in YYYY-MM-DD form, or a date the parser can read, such as Sep 15, 2026. */
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  course?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface RecurringClass {
  course: string;
  title?: string;
  /** Day names or two letter codes, such as "Tuesday", "Tue" or "TU". */
  weekdays: string[];
  start_date: string;
  end_date: string;
  start_time: string;
  end_time?: string;
  location?: string;
  /** Single dates or ranges, such as "2026-10-12" or "2026-10-12 to 2026-10-16". */
  holidays?: string[];
  reading_weeks?: string[];
}

export interface Meeting {
  date: string;
  weekday: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
}

export interface SkippedDay {
  date: string;
  weekday: string;
  reason: string;
}

export interface ExpandedClass {
  course: string;
  title: string;
  weekdays: string[];
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  meetings: Meeting[];
  skipped: SkippedDay[];
  candidate_count: number;
}

export interface IcsValidation {
  valid: boolean;
  errors: string[];
}

export interface Conflict {
  date: string;
  start_time: string;
  end_time: string;
  overlap_minutes: number;
  events: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const WEEKDAY_ALIASES: Record<string, number> = {
  "0": 0,
  su: 0,
  sun: 0,
  sunday: 0,
  "1": 1,
  mo: 1,
  mon: 1,
  monday: 1,
  "2": 2,
  tu: 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  "3": 3,
  we: 3,
  wed: 3,
  wednesday: 3,
  "4": 4,
  th: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  "5": 5,
  fr: 5,
  fri: 5,
  friday: 5,
  "6": 6,
  sa: 6,
  sat: 6,
  saturday: 6,
};

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

function monthNumber(name: string): number {
  const key = name.replace(/\./g, "").slice(0, 3).toLowerCase();
  const month = MONTHS[key];
  if (!month) throw new Error(`"${name}" is not a month. Use a month name such as September, or a date such as 2026-09-15.`);
  return month;
}

export function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function makeDate(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error(`${year}-${pad(month)}-${pad(day)} is not a real date. Check the month and the day.`);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Reads a date in YYYY-MM-DD, month name first or day first form. */
export function parseDateValue(value: string, defaultYear = new Date().getUTCFullYear()): string {
  const text = value.trim();
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (match) return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(text);
  if (match) return makeDate(match[3] ? Number(match[3]) : defaultYear, monthNumber(match[1]), Number(match[2]));

  match = /^(\d{1,2})(?:st|nd|rd|th)?(?:\s+|-)([A-Za-z]+)\.?(?:(?:,?\s+|-)(\d{4}))?$/.exec(text);
  if (match) return makeDate(match[3] ? Number(match[3]) : defaultYear, monthNumber(match[2]), Number(match[1]));

  match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(text);
  if (match) {
    let year = match[3] ? Number(match[3]) : defaultYear;
    if (year < 100) year += 2000;
    const first = Number(match[1]);
    const second = Number(match[2]);
    // 15/9 can only be day first, so a first number above 12 is read that way.
    if (first > 12 && second <= 12) return makeDate(year, second, first);
    return makeDate(year, first, second);
  }

  throw new Error(`"${value}" is not a date. Use YYYY-MM-DD, such as 2026-09-15, or a date such as September 15, 2026.`);
}

/** True when the text names a four digit year. */
export function hasYear(value: string): boolean {
  return /\b\d{4}\b/.test(value);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function weekdayIndex(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekdayName(index: number): string {
  return WEEKDAY_NAMES[index];
}

export function weekdayCode(index: number): string {
  return WEEKDAY_CODES[index];
}

export function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function normalizeWeekday(value: string): number {
  const key = value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  const index = WEEKDAY_ALIASES[key];
  if (index === undefined) {
    throw new Error(`"${value}" is not a weekday. Use a day name such as Tuesday, a short name such as Tue, or a code such as TU.`);
  }
  return index;
}

export function parseTimeValue(value: string): string {
  const text = value.trim().toLowerCase().replace(/\./g, "");
  let match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) {
      throw new Error(`"${value}" is not a time. Use a 24 hour time such as 14:30, or a time such as 2:30 PM.`);
    }
    if (match[3] === "pm" && hour !== 12) hour += 12;
    if (match[3] === "am" && hour === 12) hour = 0;
    return `${pad(hour)}:${pad(minute)}`;
  }

  match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) {
      throw new Error(`"${value}" is not a time. Use a 24 hour time such as 14:30, or a time such as 2:30 PM.`);
    }
    return `${pad(hour)}:${pad(minute)}`;
  }

  throw new Error(`"${value}" is not a time. Use a 24 hour time such as 14:30, or a time such as 2:30 PM.`);
}

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

export function formatTime(time: string): string {
  return time;
}

function splitRange(value: string): string[] {
  return value
    .split(/\s*(?:\.\.|—|–|\bto\b|\bthrough\b|\buntil\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function addSkipEntry(map: Map<string, string>, date: string, reason: string): void {
  if (!map.has(date)) map.set(date, reason);
}

/** Turns holiday and reading week entries into a date to reason map. */
export function buildSkipMap(holidays: string[] = [], readingWeeks: string[] = []): Map<string, string> {
  const map = new Map<string, string>();
  const add = (value: string, reason: string) => {
    const parts = splitRange(value);
    if (parts.length === 0) return;
    const start = parseDateValue(parts[0]);
    if (parts.length === 1) {
      addSkipEntry(map, start, reason);
      return;
    }
    if (parts.length > 2) {
      throw new Error(`"${value}" has more than two dates. Use one date or a range such as 2026-10-12 to 2026-10-16.`);
    }
    let end = parseDateValue(parts[1], Number(start.slice(0, 4)));
    if (end < start && !hasYear(parts[1])) end = parseDateValue(parts[1], Number(start.slice(0, 4)) + 1);
    if (end < start) throw new Error(`The range "${value}" ends before it starts. Check the two dates.`);
    if (daysBetween(start, end) > 400) throw new Error(`The range "${value}" is longer than 400 days. Check the two dates.`);
    for (let date = start; date <= end; date = addDays(date, 1)) addSkipEntry(map, date, reason);
  };

  for (const value of holidays) add(value, "holiday");
  for (const value of readingWeeks) add(value, "reading week");
  return map;
}

/** Works out every class meeting between two dates, minus holidays and reading weeks. */
export function expandMeetings(input: RecurringClass): ExpandedClass {
  const course = input.course.trim();
  if (!course) throw new Error("Pass a course name or code, such as BIO 101.");
  if (!input.weekdays || input.weekdays.length === 0) throw new Error("Pass at least one weekday for the class.");

  const startDate = parseDateValue(input.start_date);
  let endDate = parseDateValue(input.end_date, Number(startDate.slice(0, 4)));
  if (endDate < startDate && !hasYear(input.end_date)) {
    endDate = parseDateValue(input.end_date, Number(startDate.slice(0, 4)) + 1);
  }
  if (endDate < startDate) throw new Error("end_date is before start_date. Check the two dates.");
  if (daysBetween(startDate, endDate) > 730) throw new Error("The term is longer than 730 days. Check start_date and end_date.");

  const wanted = [...new Set(input.weekdays.map(normalizeWeekday))].sort((a, b) => a - b);
  const startTime = parseTimeValue(input.start_time);
  const endTime = input.end_time ? parseTimeValue(input.end_time) : null;
  if (endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new Error("end_time must be after start_time. Check the two times.");
  }

  const skip = buildSkipMap(input.holidays ?? [], input.reading_weeks ?? []);
  const meetings: Meeting[] = [];
  const skipped: SkippedDay[] = [];
  let candidates = 0;

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const day = weekdayIndex(date);
    if (!wanted.includes(day)) continue;
    candidates += 1;
    const reason = skip.get(date);
    if (reason) {
      skipped.push({ date, weekday: weekdayName(day), reason });
      continue;
    }
    meetings.push({
      date,
      weekday: weekdayName(day),
      start_time: startTime,
      end_time: endTime,
      location: input.location?.trim() || null,
    });
  }

  if (candidates === 0) {
    throw new Error("No class meetings fall on the chosen weekdays between start_date and end_date. Check the weekdays and the dates.");
  }
  if (meetings.length === 0) {
    throw new Error("Every class meeting in this range is skipped by a holiday or a reading week. Check the skip dates.");
  }

  return {
    course,
    title: input.title?.trim() || `${course} class`,
    weekdays: wanted.map(weekdayCode),
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    location: input.location?.trim() || null,
    meetings,
    skipped,
    candidate_count: candidates,
  };
}

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 32) || "event";
}

function icsDate(date: string): string {
  return date.replace(/-/g, "");
}

function icsDateTime(date: string, time: string): string {
  return `${icsDate(date)}T${time.replace(":", "")}00`;
}

function utcStamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

/** Folds a line at 75 bytes and joins it with a line break, as RFC 5545 asks. */
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > 75) {
      out.push(current);
      current = ` ${char}`;
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

function icsBlock(lines: string[]): string {
  return lines.map(foldIcsLine).join("\r\n");
}

export interface BuildIcsInput {
  events?: ScheduleEvent[];
  classes?: RecurringClass[];
  reminders_minutes?: number[];
  calendar_name?: string;
}

export interface BuildIcsResult {
  ics: string;
  event_count: number;
  class_count: number;
  class_meetings: number;
  valid: boolean;
  errors: string[];
}

function normalizeEvent(event: ScheduleEvent, index: number): Required<Pick<ScheduleEvent, "title" | "type" | "date">> & {
  start_time: string | null;
  end_time: string | null;
  course: string | null;
  location: string | null;
  notes: string | null;
  index: number;
} {
  const title = event.title?.trim();
  if (!title) throw new Error(`Event ${index + 1} needs a title.`);
  const date = parseDateValue(event.date);
  const startTime = event.start_time ? parseTimeValue(event.start_time) : null;
  const endTime = event.end_time ? parseTimeValue(event.end_time) : null;
  if (endTime && !startTime) throw new Error(`"${title}" has an end_time but no start_time. Pass both, or leave both out for an all day event.`);
  if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new Error(`"${title}" has an end_time that is not after its start_time. Check the two times.`);
  }
  return {
    title,
    type: event.type ?? "other",
    date,
    start_time: startTime,
    end_time: endTime,
    course: event.course?.trim() || null,
    location: event.location?.trim() || null,
    notes: event.notes?.trim() || null,
    index,
  };
}

function alarms(title: string, reminders: number[]): string[] {
  const lines: string[] = [];
  for (const minutes of reminders) {
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(minutes === 0 ? "TRIGGER:PT0M" : `TRIGGER:-PT${minutes}M`);
    lines.push(`DESCRIPTION:${escapeText(`Reminder: ${title}`)}`);
    lines.push("END:VALARM");
  }
  return lines;
}

function descriptionFor(course: string | null, notes: string | null): string | null {
  const parts: string[] = [];
  if (course) parts.push(`Course: ${course}`);
  if (notes) parts.push(notes);
  return parts.length ? parts.join("\n") : null;
}

/** Builds a calendar with one event per dated item and one recurring event per class. */
export function buildIcs(input: BuildIcsInput): BuildIcsResult {
  const events = input.events ?? [];
  const classes = input.classes ?? [];
  if (events.length === 0 && classes.length === 0) {
    throw new Error("Pass at least one event or one class to build a calendar.");
  }

  const reminders = input.reminders_minutes ?? [60];
  for (const minutes of reminders) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 40320) {
      throw new Error("Every reminder must be a whole number of minutes from 0 to 40320, which is four weeks.");
    }
  }

  const calendarName = input.calendar_name?.trim() || "Course calendar";
  const stamp = utcStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AnonymousOnyx22//syllabus-calendar-mcp//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  const normalized = events.map(normalizeEvent).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.start_time ?? "00:00").localeCompare(b.start_time ?? "00:00");
  });

  normalized.forEach((event, index) => {
    const uid = `${slug(event.title)}-${event.date}-${index}@syllabus-calendar-mcp`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (event.start_time) {
      lines.push(`DTSTART:${icsDateTime(event.date, event.start_time)}`);
      if (event.end_time) lines.push(`DTEND:${icsDateTime(event.date, event.end_time)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(event.date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(event.date, 1))}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    const description = descriptionFor(event.course, event.notes);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push(`CATEGORIES:${event.type.toUpperCase()}`);
    lines.push("STATUS:CONFIRMED");
    lines.push(...alarms(event.title, reminders));
    lines.push("END:VEVENT");
  });

  const expanded = classes.map(expandMeetings);
  expanded.forEach((item, index) => {
    const first = item.meetings[0];
    const skippedBeforeFirst = item.skipped.filter((day) => day.date < first.date).length;
    const count = item.candidate_count - skippedBeforeFirst;
    const exdates = item.skipped.filter((day) => day.date >= first.date);
    const uid = `class-${slug(item.course)}-${first.date}-${index}@syllabus-calendar-mcp`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${icsDateTime(first.date, item.start_time)}`);
    if (item.end_time) lines.push(`DTEND:${icsDateTime(first.date, item.end_time)}`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${item.weekdays.join(",")};COUNT=${count}`);
    if (exdates.length) {
      lines.push(`EXDATE:${exdates.map((day) => icsDateTime(day.date, item.start_time)).join(",")}`);
    }
    lines.push(`SUMMARY:${escapeText(item.title)}`);
    lines.push(`DESCRIPTION:${escapeText(`Course: ${item.course}`)}`);
    if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
    lines.push("CATEGORIES:CLASS");
    lines.push("STATUS:CONFIRMED");
    lines.push(...alarms(item.title, reminders));
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  const ics = `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
  const validation = validateIcs(ics);
  return {
    ics,
    event_count: normalized.length,
    class_count: expanded.length,
    class_meetings: expanded.reduce((sum, item) => sum + item.meetings.length, 0),
    valid: validation.valid,
    errors: validation.errors,
  };
}

function blockName(line: string): string | null {
  const match = /^BEGIN:([A-Z]+)$/.exec(line);
  return match ? match[1] : null;
}

/** Checks the parts of a calendar that clients are strict about. */
export function validateIcs(ics: string): IcsValidation {
  const errors: string[] = [];
  if (!ics.endsWith("\r\n")) errors.push("The calendar does not end with a line break.");
  if (/(^|[^\r])\n/.test(ics)) errors.push("Every line break must be a CRLF pair.");

  const lines = ics.split("\r\n").filter((line) => line !== "");
  if (lines[0] !== "BEGIN:VCALENDAR") errors.push("The calendar must start with BEGIN:VCALENDAR.");
  if (lines[lines.length - 1] !== "END:VCALENDAR") errors.push("The calendar must end with END:VCALENDAR.");

  const stack: string[] = [];
  const events: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > 75) errors.push(`A line is longer than 75 bytes: ${line.slice(0, 24)}`);
    if (line === "BEGIN:VEVENT") {
      current = [];
      events.push(current);
    }
    const open = blockName(line);
    if (open) {
      stack.push(open);
    } else if (line.startsWith("END:")) {
      const close = line.slice(4);
      const top = stack.pop();
      if (top !== close) errors.push(`END:${close} does not match BEGIN:${top ?? "nothing"}.`);
      if (close === "VEVENT") current = null;
    } else if (current) {
      current.push(line);
    }
  }
  if (stack.length) errors.push(`The calendar has an unclosed block: ${stack.join(", ")}.`);

  if (!lines.includes("VERSION:2.0")) errors.push("The calendar needs VERSION:2.0.");
  if (!lines.some((line) => line.startsWith("PRODID:"))) errors.push("The calendar needs a PRODID line.");

  for (const [index, event] of events.entries()) {
    const names = event.map((line) => line.split(/[;:]/)[0]);
    for (const required of ["UID", "DTSTAMP", "DTSTART", "SUMMARY"]) {
      if (!names.includes(required)) errors.push(`Event ${index + 1} has no ${required}.`);
    }
    if (names.includes("VALARM")) {
      if (!names.includes("ACTION")) errors.push(`Event ${index + 1} has a reminder with no ACTION.`);
      if (!names.includes("TRIGGER")) errors.push(`Event ${index + 1} has a reminder with no TRIGGER.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function writeIcsFile(path: string, ics: string): string {
  const target = path.trim();
  if (!target) throw new Error("output_path is empty. Pass a file path, or leave it out to get the calendar text only.");
  try {
    writeFileSync(target, ics, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const folder = dirname(resolve(target));
      throw new Error(
        `The folder "${folder}" does not exist. This server does not create folders. Create the folder first, or leave output_path out to get the calendar text back and save it as a .ics file yourself.`,
      );
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not write the calendar to "${target}": ${reason}`);
  }
  return target;
}

interface ParsedDateTime {
  date: string;
  time: string | null;
}

function parseIcsDateTime(value: string): ParsedDateTime | null {
  let match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (match) return { date: `${match[1]}-${match[2]}-${match[3]}`, time: null };
  match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
  if (match) return { date: `${match[1]}-${match[2]}-${match[3]}`, time: `${match[4]}:${match[5]}` };
  return null;
}

export interface ParsedIcsEvent {
  uid: string | null;
  summary: string;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  rrule: Record<string, string> | null;
  exdates: ParsedDateTime[];
  raw: string[];
  calendar: string;
  order: number;
}

/** Reads the events of a simple calendar file, which is what this server builds. */
export function parseIcsEvents(ics: string, calendar = "Calendar"): ParsedIcsEvent[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events: ParsedIcsEvent[] = [];
  let block: string[] | null = null;
  let order = 0;

  const flush = () => {
    if (!block) return;
    let uid: string | null = null;
    let summary = "";
    let start: ParsedDateTime | null = null;
    let end: ParsedDateTime | null = null;
    let location: string | null = null;
    let rrule: Record<string, string> | null = null;
    const exdates: ParsedDateTime[] = [];

    for (const line of block) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const left = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const name = left.split(";")[0];
      if (name === "UID") uid = value.trim();
      else if (name === "SUMMARY") summary = unescapeText(value);
      else if (name === "DTSTART") start = parseIcsDateTime(value);
      else if (name === "DTEND") end = parseIcsDateTime(value);
      else if (name === "LOCATION") location = unescapeText(value);
      else if (name === "RRULE") {
        rrule = {};
        for (const part of value.split(";")) {
          const [key, val] = part.split("=");
          if (key && val) rrule[key.toUpperCase()] = val;
        }
      } else if (name === "EXDATE") {
        for (const item of value.split(",")) {
          const parsed = parseIcsDateTime(item);
          if (parsed) exdates.push(parsed);
        }
      }
    }

    if (start) {
      events.push({
        uid,
        summary: summary || "Untitled event",
        start_date: start.date,
        start_time: start.time,
        end_date: end?.date ?? null,
        end_time: end?.time ?? null,
        location,
        rrule,
        exdates,
        raw: block,
        calendar,
        order: order++,
      });
    }
    block = null;
  };

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      block = ["BEGIN:VEVENT"];
      continue;
    }
    if (line === "END:VEVENT") {
      if (block) {
        block.push("END:VEVENT");
        flush();
      }
      continue;
    }
    if (block) block.push(line);
  }
  return events;
}

interface Occurrence {
  date: string;
  start: string;
  end: string;
}

function eventDuration(event: ParsedIcsEvent): number {
  if (event.start_time && event.end_time) {
    const minutes = timeToMinutes(event.end_time) - timeToMinutes(event.start_time);
    return minutes > 0 ? minutes : 60;
  }
  return 60;
}

function occurrences(event: ParsedIcsEvent): Occurrence[] {
  if (!event.start_time) return [];
  const duration = eventDuration(event);
  const out: Occurrence[] = [];
  const make = (date: string): Occurrence => ({
    date,
    start: event.start_time!,
    end: event.end_date === date && event.end_time ? event.end_time : minutesToTime(timeToMinutes(event.start_time!) + duration),
  });

  if (!event.rrule) return [make(event.start_date)];

  const freq = event.rrule.FREQ?.toUpperCase();
  if (freq !== "WEEKLY" && freq !== "DAILY") return [make(event.start_date)];

  const count = event.rrule.COUNT ? Number(event.rrule.COUNT) : 52;
  const interval = event.rrule.INTERVAL ? Number(event.rrule.INTERVAL) : 1;
  const byday = event.rrule.BYDAY
    ? new Set(event.rrule.BYDAY.split(",").map((code) => WEEKDAY_CODES.indexOf(code.trim().toUpperCase())).filter((index) => index >= 0))
    : freq === "WEEKLY"
      ? new Set([weekdayIndex(event.start_date)])
      : null;
  const excluded = new Set(event.exdates.map((item) => item.date));
  const startWeek = Math.floor(daysBetween("1970-01-01", event.start_date) / 7);
  let emitted = 0;

  for (let offset = 0; offset < 730 && emitted < count; offset += 1) {
    const date = addDays(event.start_date, offset);
    if (freq === "WEEKLY") {
      const week = Math.floor(daysBetween("1970-01-01", date) / 7);
      if ((week - startWeek) % interval !== 0) continue;
    } else if (offset % interval !== 0) {
      continue;
    }
    if (byday && !byday.has(weekdayIndex(date))) continue;
    if (excluded.has(date)) continue;
    out.push(make(date));
    emitted += 1;
  }
  return out;
}

export interface MergeCalendarInput {
  name?: string;
  ics: string;
}

export interface MergeResult {
  ics: string;
  event_count: number;
  calendar_count: number;
  conflicts: Conflict[];
  valid: boolean;
  errors: string[];
}

/** Combines calendars, drops repeated UIDs and lists timed events that overlap. */
export function mergeCalendars(calendars: MergeCalendarInput[], calendarName = "Merged course calendar"): MergeResult {
  if (!calendars.length) throw new Error("Pass at least one calendar to merge.");
  const kept: ParsedIcsEvent[] = [];
  const seen = new Set<string>();

  calendars.forEach((calendar, index) => {
    const name = calendar.name?.trim() || `Calendar ${index + 1}`;
    const check = validateIcs(calendar.ics);
    if (!check.valid) throw new Error(`"${name}" is not a valid calendar: ${check.errors[0]}`);
    const parsed = parseIcsEvents(calendar.ics, name);
    for (const event of parsed) {
      const key = event.uid ? `uid:${event.uid}` : `key:${event.summary}|${event.start_date}|${event.start_time ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(event);
    }
  });

  kept.sort((a, b) => {
    if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
    return (a.start_time ?? "00:00").localeCompare(b.start_time ?? "00:00");
  });

  const conflicts: Conflict[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    for (let j = i + 1; j < kept.length; j += 1) {
      const a = kept[i];
      const b = kept[j];
      for (const left of occurrences(a)) {
        for (const right of occurrences(b)) {
          if (left.date !== right.date) continue;
          const start = Math.max(timeToMinutes(left.start), timeToMinutes(right.start));
          const end = Math.min(timeToMinutes(left.end), timeToMinutes(right.end));
          if (end <= start) continue;
          conflicts.push({
            date: left.date,
            start_time: minutesToTime(start),
            end_time: minutesToTime(end),
            overlap_minutes: end - start,
            events: [`${a.summary} (${a.calendar})`, `${b.summary} (${b.calendar})`],
          });
        }
      }
    }
  }
  conflicts.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AnonymousOnyx22//syllabus-calendar-mcp//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of kept) lines.push(...event.raw);
  lines.push("END:VCALENDAR");
  const ics = `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
  const validation = validateIcs(ics);

  return {
    ics,
    event_count: kept.length,
    calendar_count: calendars.length,
    conflicts,
    valid: validation.valid,
    errors: validation.errors,
  };
}
