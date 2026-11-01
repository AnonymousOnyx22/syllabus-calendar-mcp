# Changelog

## Unreleased

- build_ics and merge_calendars now name the folder that is missing when output_path points into a folder that does not exist, and remind you that folders are not created and that leaving output_path out returns the calendar text.

- extract_schedule_events now answers with a count of 0, the lines that had no date, and a next_step that says how to fix the pasted text, instead of returning an error when no dated events are found.

## 0.1.2

- extract_schedule_events now lists the lines that had no date and suggests adding a date when no events are found, instead of only saying no dated events were found.

## 0.1.1

- extract_schedule_events now returns lines that have no date in undated_lines and lists them in the text answer, instead of dropping them silently.

## 0.1.0

- First release. Added extract_schedule_events, expand_recurring_classes, build_ics and merge_calendars.
- Build valid .ics calendars with reminders, weekly recurring events, holidays and reading weeks skipped.
- Merge calendars, dedupe by UID and list timed conflicts.
- Works offline, no account.
