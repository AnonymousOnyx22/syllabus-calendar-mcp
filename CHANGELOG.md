# Changelog

## Unreleased

- extract_schedule_events now lists the lines that had no date and suggests adding a date when no events are found, instead of only saying no dated events were found.

## 0.1.1

- extract_schedule_events now returns lines that have no date in undated_lines and lists them in the text answer, instead of dropping them silently.

## 0.1.0

- First release. Added extract_schedule_events, expand_recurring_classes, build_ics and merge_calendars.
- Build valid .ics calendars with reminders, weekly recurring events, holidays and reading weeks skipped.
- Merge calendars, dedupe by UID and list timed conflicts.
- Works offline, no account.
