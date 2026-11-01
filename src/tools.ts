import { z } from "zod";
import { type ToolDef, bullets } from "./core/tools.js";
import {
  EVENT_TYPES,
  buildIcs,
  expandMeetings,
  formatDate,
  mergeCalendars,
  writeIcsFile,
  type BuildIcsInput,
  type RecurringClass,
  type ScheduleEvent,
} from "./calendar.js";
import { describeEvent, extractEvents, fixTheTextHint } from "./extract.js";

type Api = null;

const eventFields = z.object({
  title: z.string().describe("Title of the event."),
  type: z.enum(EVENT_TYPES).describe("The kind of event: assignment, exam, quiz, lab, reading, class or other."),
  date: z.string().describe("Date of the event as YYYY-MM-DD."),
  start_time: z.string().nullable().describe("Start time as HH:MM, or null for an all day event."),
  end_time: z.string().nullable().describe("End time as HH:MM, or null when the event has no end time."),
  course: z.string().nullable().describe("Course name or code, or null when the event has none."),
  location: z.string().nullable().describe("Room or place, or null when the event has none."),
  notes: z.string().nullable().describe("Extra notes, or null when the event has none."),
});

const meetingFields = z.object({
  date: z.string().describe("Date of the meeting as YYYY-MM-DD."),
  weekday: z.string().describe("Day of the week of the meeting."),
  start_time: z.string().describe("Start time as HH:MM."),
  end_time: z.string().nullable().describe("End time as HH:MM, or null when no end time was passed."),
  location: z.string().nullable().describe("Room or place, or null when no location was passed."),
});

const skippedFields = z.object({
  date: z.string().describe("Date that was skipped, as YYYY-MM-DD."),
  weekday: z.string().describe("Day of the week of the skipped date."),
  reason: z.string().describe("Why the date was skipped, such as holiday or reading week."),
});

const conflictFields = z.object({
  date: z.string().describe("Date of the overlap as YYYY-MM-DD."),
  start_time: z.string().describe("Start of the overlap as HH:MM."),
  end_time: z.string().describe("End of the overlap as HH:MM."),
  overlap_minutes: z.number().describe("How many minutes the two events overlap."),
  events: z.array(z.string()).describe("The two events that overlap, each with its calendar name."),
});

const eventInput = z.object({
  title: z.string().describe("Title of the event, such as Assignment 1 or Midterm exam."),
  type: z.enum(EVENT_TYPES).optional().describe("The kind of event. Defaults to other."),
  date: z.string().describe("Date of the event as YYYY-MM-DD, or a date such as September 15, 2026."),
  start_time: z.string().optional().describe("Start time as HH:MM or 2:30 PM. Leave it out for an all day event."),
  end_time: z.string().optional().describe("End time as HH:MM or 2:30 PM. It must be after start_time."),
  course: z.string().optional().describe("Course name or code."),
  location: z.string().optional().describe("Room or place."),
  notes: z.string().optional().describe("Extra notes for the event."),
});

const classInput = z.object({
  course: z.string().describe("Course name or code, such as BIO 101."),
  title: z.string().optional().describe("Title for the calendar event. Defaults to the course name plus class."),
  weekdays: z.array(z.string()).min(1).describe('Days the class meets, as names or codes, such as "Tuesday", "Tue" or "TU".'),
  start_date: z.string().describe("First date of the term as YYYY-MM-DD."),
  end_date: z.string().describe("Last date of the term as YYYY-MM-DD."),
  start_time: z.string().describe("Class start time as HH:MM or 2:30 PM."),
  end_time: z.string().optional().describe("Class end time as HH:MM or 2:30 PM. It must be after start_time."),
  location: z.string().optional().describe("Room or place."),
  holidays: z.array(z.string()).optional().describe('Holiday dates or ranges, such as "2026-10-12" or "2026-10-12 to 2026-10-16".'),
  reading_weeks: z.array(z.string()).optional().describe('Reading week dates or ranges, such as "2026-10-12 to 2026-10-16".'),
});

const outputPath = z
  .string()
  .optional()
  .describe("Optional file path for the .ics file. The folder must already exist because folders are not created. Leave it out to get the calendar text back instead.");

export const tools: ToolDef<Api>[] = [
  {
    name: "extract_schedule_events",
    title: "Extract schedule events",
    description:
      "Extract dated events from pasted syllabus text. Each line that names a date becomes one event, with a title, a type, a date and optional times. " +
      "Inputs: text (the pasted syllabus or course schedule, one event per line), course (a course name or code to put on every event), year (the year to use when a date has no year) and term_start (the first day of the term, so a line such as Week 5: Midterm becomes an event). " +
      "Titles are read from the words around the date, and each event is marked as an assignment, exam, quiz, lab, reading, class or other. " +
      "Any line that has no date is returned in undated_lines instead of being dropped silently. " +
      "The answer ends with a next step hint that points to build_ics when the events should become a calendar. " +
      "When no line names a date, the count is 0 and the next step tells the student how to fix the pasted text. " +
      'Example prompt: "Turn this syllabus into calendar events: Assignment 1 due Sep 15, Midterm exam October 20 at 10:00."',
    inputSchema: {
      text: z.string().min(1).describe("The pasted syllabus or course schedule. Put one event on each line, with a date on the line."),
      course: z.string().optional().describe("Course name or code to put on every event, such as BIO 101."),
      year: z
        .number()
        .int()
        .min(1900)
        .max(2200)
        .optional()
        .describe("The year to use when a date has no year. Defaults to the current year."),
      term_start: z
        .string()
        .optional()
        .describe("First day of the term as YYYY-MM-DD. When set, a line like Week 5: Midterm with no date becomes an event on the first day of week 5, where week 1 starts on this date."),
    },
    outputSchema: {
      events: z.array(eventFields).describe("Every dated event that was found, in date order."),
      count: z.number().describe("How many events were found."),
      year: z.number().describe("The year used for dates that did not name one."),
      undated_lines: z.array(z.string()).describe("Lines that had no date, kept in the order they appeared so they can be fixed."),
      next_step: z.string().describe("Suggested next tool call for turning the events into a calendar."),
    },
    run: async (a) => {
      const result = extractEvents(a.text, { course: a.course, year: a.year, termStart: a.term_start });
      if (result.count === 0) {
        const nextStep = fixTheTextHint(result.undated_lines);
        return {
          text: `0 events found.\n\n${nextStep}`,
          structured: {
            events: result.events,
            count: result.count,
            year: result.year,
            undated_lines: result.undated_lines,
            next_step: nextStep,
          },
        };
      }
      const label = result.count === 1 ? "event" : "events";
      let text = `${result.count} ${label} found.`;
      if (result.undated_lines.length) {
        const undatedLabel = result.undated_lines.length === 1 ? "line" : "lines";
        text += `\n\n${result.undated_lines.length} ${undatedLabel} had no date and were not turned into events:\n\n${bullets(result.undated_lines)}`;
      }
      text += `\n\n${bullets(result.events.map(describeEvent))}`;
      const nextStep = "Next: pass these events to build_ics as events to make an .ics calendar.";
      text += `\n\n${nextStep}`;
      return {
        text,
        structured: {
          events: result.events,
          count: result.count,
          year: result.year,
          undated_lines: result.undated_lines,
          next_step: nextStep,
        },
      };
    },
  },
  {
    name: "expand_recurring_classes",
    title: "Expand recurring classes",
    description:
      "Generate the meeting dates for a recurring class between two dates, and skip holidays and reading weeks. " +
      "Inputs: course, weekdays (day names or codes such as Tuesday or TU), start_date, end_date, start_time, optional end_time, optional location, holidays (single dates or ranges) and reading_weeks (single dates or ranges). " +
      "Returns every meeting date plus the dates that were skipped and why. " +
      "The answer ends with a next step hint that points to build_ics when the class should become a calendar. " +
      'Example prompt: "My biology class meets Tuesday and Thursday from Sep 8 to Dec 10, 2026 at 10:00. Skip the reading week of Oct 12 to Oct 16."',
    inputSchema: {
      course: z.string().min(1).describe("Course name or code, such as BIO 101."),
      title: z.string().optional().describe("Title for the calendar event. Defaults to the course name plus class."),
      weekdays: z.array(z.string()).min(1).describe('Days the class meets, as names or codes, such as "Tuesday", "Tue" or "TU".'),
      start_date: z.string().describe("First date of the term as YYYY-MM-DD."),
      end_date: z.string().describe("Last date of the term as YYYY-MM-DD."),
      start_time: z.string().describe("Class start time as HH:MM or 2:30 PM."),
      end_time: z.string().optional().describe("Class end time as HH:MM or 2:30 PM. It must be after start_time."),
      location: z.string().optional().describe("Room or place."),
      holidays: z.array(z.string()).optional().describe('Holiday dates or ranges, such as "2026-10-12" or "2026-10-12 to 2026-10-16".'),
      reading_weeks: z.array(z.string()).optional().describe('Reading week dates or ranges, such as "2026-10-12 to 2026-10-16".'),
    },
    outputSchema: {
      course: z.string().describe("Course name or code."),
      title: z.string().describe("Title used for the calendar event."),
      weekdays: z.array(z.string()).describe("The weekdays as two letter codes."),
      start_date: z.string().describe("First date of the term."),
      end_date: z.string().describe("Last date of the term."),
      start_time: z.string().describe("Class start time."),
      end_time: z.string().nullable().describe("Class end time, or null when none was passed."),
      location: z.string().nullable().describe("Room or place, or null when none was passed."),
      meetings: z.array(meetingFields).describe("Every class meeting, in date order."),
      skipped: z.array(skippedFields).describe("Dates that were skipped, with the reason."),
      candidate_count: z.number().describe("How many dates matched the weekdays before holidays and reading weeks were removed."),
      next_step: z.string().describe("Suggested next tool call for turning the class meetings into a calendar."),
    },
    run: async (a) => {
      const result = expandMeetings(a as RecurringClass);
      const lines = result.meetings.map((meeting) => {
        const end = meeting.end_time ? ` to ${meeting.end_time}` : "";
        const place = meeting.location ? ` in ${meeting.location}` : "";
        return `${formatDate(meeting.date)} ${meeting.start_time}${end}${place}`;
      });
      let text = `${result.meetings.length} class meetings for ${result.course} from ${formatDate(result.start_date)} to ${formatDate(result.end_date)}.\n\n${bullets(lines)}`;
      if (result.skipped.length) {
        const skipped = result.skipped.map((day) => `${formatDate(day.date)} (${day.reason})`);
        text += `\n\nSkipped:\n\n${bullets(skipped)}`;
      }
      const nextStep = "Next: pass this class to build_ics in classes to make an .ics calendar.";
      text += `\n\n${nextStep}`;
      const { meetings, skipped, ...rest } = result;
      return {
        text,
        structured: { ...rest, meetings, skipped, next_step: nextStep },
      };
    },
  },
  {
    name: "build_ics",
    title: "Build an ics calendar",
    description:
      "Build a valid .ics calendar file from dated events and recurring classes, with reminders. " +
      "Inputs: events (each with title, date, optional start_time, end_time, type, course, location and notes), classes (each with course, weekdays, start_date, end_date, start_time and optional end_time, location, holidays and reading_weeks), reminders_minutes (whole minutes before each event, default 60), calendar_name and optional output_path. " +
      "Each class becomes one weekly recurring event with holidays and reading weeks removed. The tool checks the file before returning it. " +
      'Example prompt: "Make an .ics file for my course with a reminder one day before each assignment."',
    inputSchema: {
      events: z.array(eventInput).optional().describe("Dated events such as assignments and exams."),
      classes: z.array(classInput).optional().describe("Recurring classes to add as weekly events."),
      reminders_minutes: z
        .array(z.number().int().min(0).max(40320))
        .optional()
        .describe("Reminder times in whole minutes before an event. Defaults to [60]. Pass an empty array for no reminders."),
      calendar_name: z.string().optional().describe('Name shown in the calendar app. Defaults to "Course calendar".'),
      output_path: outputPath,
    },
    outputSchema: {
      ics: z.string().describe("The calendar file as text, with CRLF line breaks."),
      event_count: z.number().describe("How many single events the calendar holds."),
      class_count: z.number().describe("How many recurring classes the calendar holds."),
      class_meetings: z.number().describe("How many class meetings the recurring events produce after skips."),
      valid: z.boolean().describe("True when the calendar passed the built in checks."),
      errors: z.array(z.string()).describe("Problems found by the checks. Empty when the calendar is valid."),
      output_path: z.string().nullable().describe("The file path the calendar was written to, or null when no path was passed."),
    },
    run: async (a) => {
      const built = buildIcs(a as BuildIcsInput);
      let saved: string | null = null;
      if (a.output_path) saved = writeIcsFile(a.output_path, built.ics);
      const events = built.event_count === 1 ? "event" : "events";
      const classes = built.class_count === 1 ? "class" : "classes";
      let text =
        `Built a calendar with ${built.event_count} ${events}, ${built.class_count} ${classes} and ${built.class_meetings} class meetings. ` +
        (built.valid ? "The file passed every check." : `The file has problems: ${built.errors.join(" ")}`);
      if (saved) text += `\nSaved to ${saved}.`;
      text += `\n\n\`\`\`ics\n${built.ics}\`\`\`\n`;
      return {
        text,
        structured: {
          ics: built.ics,
          event_count: built.event_count,
          class_count: built.class_count,
          class_meetings: built.class_meetings,
          valid: built.valid,
          errors: built.errors,
          output_path: saved,
        },
      };
    },
    readOnly: false,
  },
  {
    name: "merge_calendars",
    title: "Merge course calendars",
    description:
      "Merge several course calendars into one and list timed events that overlap. " +
      "Inputs: calendars (each with an optional name and an ics string), optional calendar_name and optional output_path. " +
      "Events with the same UID are kept once. Weekly and daily recurring events are expanded when conflicts are checked. " +
      'Example prompt: "Merge my three course calendars and tell me which classes conflict."',
    inputSchema: {
      calendars: z
        .array(
          z.object({
            name: z.string().optional().describe("A name for the calendar, such as BIO 101."),
            ics: z.string().min(1).describe("The calendar file as text."),
          }),
        )
        .min(1)
        .describe("The calendars to merge, each with the calendar text and an optional name."),
      calendar_name: z.string().optional().describe('Name for the merged calendar. Defaults to "Merged course calendar".'),
      output_path: outputPath,
    },
    outputSchema: {
      ics: z.string().describe("The merged calendar as text, with CRLF line breaks."),
      event_count: z.number().describe("How many events the merged calendar holds, after repeated UIDs are dropped."),
      calendar_count: z.number().describe("How many calendars were passed in."),
      conflicts: z.array(conflictFields).describe("Every pair of timed events that overlaps, in date order."),
      valid: z.boolean().describe("True when the merged calendar passed the built in checks."),
      errors: z.array(z.string()).describe("Problems found by the checks. Empty when the calendar is valid."),
      output_path: z.string().nullable().describe("The file path the calendar was written to, or null when no path was passed."),
    },
    run: async (a) => {
      const merged = mergeCalendars(a.calendars, a.calendar_name);
      let saved: string | null = null;
      if (a.output_path) saved = writeIcsFile(a.output_path, merged.ics);
      const events = merged.event_count === 1 ? "event" : "events";
      const calendars = merged.calendar_count === 1 ? "calendar" : "calendars";
      let text = `Merged ${merged.event_count} ${events} from ${merged.calendar_count} ${calendars}.`;
      if (merged.conflicts.length === 0) {
        text += "\n\nNo timed events overlap.";
      } else {
        const lines = merged.conflicts.map(
          (conflict) =>
            `${formatDate(conflict.date)} ${conflict.start_time} to ${conflict.end_time} (${conflict.overlap_minutes} minutes): ${conflict.events.join(" overlaps with ")}`,
        );
        text += `\n\n${merged.conflicts.length} overlaps found:\n\n${bullets(lines)}`;
      }
      if (!merged.valid) text += `\n\nThe merged file has problems: ${merged.errors.join(" ")}`;
      if (saved) text += `\nSaved to ${saved}.`;
      text += `\n\n\`\`\`ics\n${merged.ics}\`\`\`\n`;
      return {
        text,
        structured: {
          ics: merged.ics,
          event_count: merged.event_count,
          calendar_count: merged.calendar_count,
          conflicts: merged.conflicts,
          valid: merged.valid,
          errors: merged.errors,
          output_path: saved,
        },
      };
    },
    readOnly: false,
  },
];
