# syllabus to calendar mcp

[![npm](https://img.shields.io/npm/v/syllabus-calendar-mcp.svg)](https://www.npmjs.com/package/syllabus-calendar-mcp)
[![downloads](https://img.shields.io/npm/dm/syllabus-calendar-mcp.svg)](https://www.npmjs.com/package/syllabus-calendar-mcp)
[![license](https://img.shields.io/badge/license-mit-blue.svg)](license)
[![star on github](https://img.shields.io/github/stars/anonymousonyx22/syllabus-calendar-mcp.svg)](https://github.com/anonymousonyx22/syllabus-calendar-mcp)

syllabus to calendar mcp is a free [mcp](https://modelcontextprotocol.io) server, published on npm as `syllabus-calendar-mcp`. turn pasted syllabus text into calendar events, build valid .ics files from events and recurring classes, skip holidays and reading weeks, and merge calendars to find conflicts. the math and parsing are done by tested code. it runs on your computer, needs no internet and no login.

parses pasted text from Canvas, Brightspace, Moodle or a PDF export.

free forever. no account.

## comparison

brightspace-mcp-server and @exhabition/brightspace-mcp need a brightspace login before they can read anything. this server needs no account, no api key and no network. it works on syllabus text you paste, so it covers any school's syllabus, not only brightspace courses.

## sample output

paste text like this:

```text
Assignment 1 due Sep 15
Midterm exam October 20 at 10:00
Lab report 2 due Dec 8
```

`extract_schedule_events` with `course` set to BIO 101 and `year` set to 2026 returns:

```text
3 events found.

- Tue, Sep 15, 2026: Assignment 1 (assignment) [BIO 101]
- Tue, Oct 20, 2026 at 10:00: Midterm exam (exam) [BIO 101]
- Tue, Dec 8, 2026: Lab report 2 (lab) [BIO 101]

Next: pass these events to build_ics as events to make an .ics calendar.
```

if a pasted line has no date, it is not dropped. `extract_schedule_events` returns those lines in `undated_lines` and lists them below the events, so you can fix the text and run the tool again.

`build_ics` turns those events into a calendar that starts like this:

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AnonymousOnyx22//syllabus-calendar-mcp//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:BIO 101
```

## install

run it straight from npm with `npx`. you need node.js 20 or newer, see [node version](#node-version) for the details.

```bash
npx -y syllabus-calendar-mcp
```

add it to your ai app's mcp config so the app can start it for you. every app reads its config from its own file, so pick yours:

- [claude desktop](#claude-desktop)
- [cursor](#cursor)
- [vs code copilot](#vs-code-copilot)

### claude desktop

add this to `claude_desktop_config.json`:

```json
{
  "mcpservers": {
    "syllabus-calendar": {
      "command": "npx",
      "args": ["-y", "syllabus-calendar-mcp"]
    }
  }
}
```

restart claude desktop after you save the file.

### command line

run this in a terminal:

```bash
npx -y @modelcontextprotocol/inspector syllabus-calendar-mcp
```

### cursor

cursor reads `mcp.json` from the project folder at `.cursor/mcp.json`, or from your home folder at `~/.cursor/mcp.json`.

```json
{
  "mcpservers": {
    "syllabus-calendar": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "syllabus-calendar-mcp"]
    }
  }
}
```

restart cursor after you save the file.

### vs code copilot

put this in `.vscode/mcp.json` in your project folder, or in the `mcp.json` file in your user profile:

```json
{
  "servers": {
    "syllabus-calendar": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "syllabus-calendar-mcp"]
    }
  }
}
```

vs code also reads a portable `.mcp.json` file in the project root. that file uses the name `mcpservers` instead of `servers`:

```json
{
  "mcpservers": {
    "syllabus-calendar": {
      "command": "npx",
      "args": ["-y", "syllabus-calendar-mcp"]
    }
  }
}
```

restart vs code after you save the file.

## try these four prompts

1. turn syllabus text into events

   > "turn this syllabus into calendar events: assignment 1 due sep 15, midterm exam october 20 at 10:00."

   the model calls `extract_schedule_events` and returns dated events with types and times.

2. add a recurring class

   > "my biology class meets tuesday and thursday from sep 8 to dec 10, 2026 at 10:00. skip the reading week of oct 12 to oct 16."

   the model calls `expand_recurring_classes` and returns meetings plus skipped dates.

3. make an ics calendar

   > "make an .ics file for my course with a reminder one day before each assignment."

   the model calls `build_ics` with events and reminders to produce a valid calendar.

4. check for conflicts

   > "merge my three course calendars and tell me which classes conflict."

   the model calls `merge_calendars`, which merges the calendars, drops duplicate events by uid and lists timed events that overlap.

## tools

four tools. these names are the ones your ai app sees.

| tool | parameters | what it does | example prompt |
| --- | --- | --- | --- |
| `extract_schedule_events` | `text`, `course`, `year` | extract dated events from pasted syllabus text, one per line with dates. lines with no date are returned in `undated_lines`. ends with a next step hint to `build_ics`. | "turn this syllabus into calendar events: assignment 1 due sep 15, midterm exam october 20 at 10:00." |
| `expand_recurring_classes` | `course`, `title`, `weekdays`, `start_date`, `end_date`, `start_time`, `end_time`, `location`, `holidays`, `reading_weeks` | generate meeting dates for a recurring class, skipping holidays and reading weeks. ends with a next step hint to `build_ics`. | "my biology class meets tuesday and thursday from sep 8 to dec 10, 2026 at 10:00. skip the reading week of oct 12 to oct 16." |
| `build_ics` | `events`, `classes`, `reminders_minutes`, `calendar_name`, `output_path` | build a valid .ics calendar from events and classes, with reminders. write to a file when output_path is passed. | "make an .ics file for my course with a reminder one day before each assignment." |
| `merge_calendars` | `calendars`, `calendar_name`, `output_path` | merge calendars, dedupe by uid and list timed conflicts. write to a file when output_path is passed. | "merge my three course calendars and tell me which classes conflict." |

every tool returns text and structured data. `build_ics` and `merge_calendars` may write files; other tools are read only.

## troubleshooting

**zero events came back.** `extract_schedule_events` makes one event from each line that names a date. check `undated_lines` in the result: those are the lines it skipped. paste the schedule with one item per line, and write dates like "sep 15" or "9/15" on the same line as the title. if the text is one long paragraph, split it into lines first and try again.

**the dates have the wrong year.** when a date has no year, the tool uses the current year. the result shows the `year` it used. pass `year` (for example 2026) to `extract_schedule_events`, or write the year in the date. for `expand_recurring_classes`, give `start_date` and `end_date` with the full year.

**the file was not written.** `build_ics` and `merge_calendars` only write a file when you pass `output_path`. the folder has to exist already, because the server does not create folders. use a full path you can write to, such as a folder in your home directory. a relative path is resolved from the folder the server was started in, which may not be where you expect. if you leave `output_path` out, you get the calendar text back and can save it as a .ics file yourself.

**the server does not show up in your app.** check that your node.js is version 20 or newer, then restart the app after you edit its config. the install steps above show the exact entry for each app.

## node version

there are two floors here, and they are not the same number.

| what you are doing | node.js |
| --- | --- |
| running the published server | 20 or newer |
| building and testing a clone | 22.12 or newer, on the 22 and 24 release lines or 26 and later |

the server itself is happy on node.js 20, and that is what `engines` in package.json says. the test tool wants a newer node.js, so the development floor lives in `devengines` in the same file. npm checks `devengines` before install and before tests. serviceh numbers live in package.json.

## development

```bash
npm install
npm run build
npm test
```

the tests call tools through a real mcp client. no account or network needed.

## privacy

all processing is local. no data is stored. no network calls. no login or keys required.

## More free student MCP servers

All free, open source and read only where they touch your accounts. Browse the full list at [brightspacemcp.com/more-mcps](https://brightspacemcp.com/more-mcps/).

| Server | What it does |
| --- | --- |
| [Brightspace MCP](https://github.com/AnonymousOnyx22/brightspace-d2l-mcp) | D2L Brightspace for AI. Due dates with real submission status, grades, a target grade calculator and course files. |
| [Canvas MCP](https://github.com/AnonymousOnyx22/canvas-lms-student-mcp) | Canvas LMS for AI, read only. Due dates, missing work, grades and announcements. |
| [Moodle MCP](https://github.com/AnonymousOnyx22/moodle-student-mcp) | Moodle for AI, read only. Due dates, overdue work, grades and announcements. |
| [Google Classroom MCP](https://github.com/AnonymousOnyx22/google-classroom-student-mcp) | Google Classroom for AI, read only. Todos, due dates, missing work and grades. |
| [GPA Calculator MCP](https://github.com/AnonymousOnyx22/gpa-calculator-mcp) | GPA, grade conversion and the grade you need on the final, for AI. Works offline, no account. |
| [Citations MCP](https://github.com/AnonymousOnyx22/student-citations-mcp) | APA, MLA and Chicago citations from a DOI, an ISBN or typed details. No account. |
| [Study Planner MCP](https://github.com/AnonymousOnyx22/study-planner-mcp) | Exam study schedules, spaced repetition dates, pomodoro plans and assignment milestones. Works offline. |
| [Paper Finder MCP](https://github.com/AnonymousOnyx22/paper-finder-student-mcp) | Search scholarly papers, find open access copies and related work through OpenAlex. No key needed. |
| [BibTeX Reference Manager MCP](https://github.com/AnonymousOnyx22/bibtex-reference-manager-mcp) | Clean, convert, dedupe and lint BibTeX, RIS and CSL JSON reference lists, and make cite keys. Works offline. |
| [Open Textbook Finder MCP](https://github.com/AnonymousOnyx22/open-textbook-finder-mcp) | Find free legal copies of textbooks on OpenStax, DOAB and Open Library, look up editions by ISBN and suggest cheaper older ones. |
| [STEM Calculator MCP](https://github.com/AnonymousOnyx22/stem-calc-student-mcp) | Chemistry and physics homework math: molar mass, balancing equations, grams to moles, unit conversion and significant figures. Works offline. |
| [Essay Stats MCP](https://github.com/AnonymousOnyx22/essay-stats-mcp) | Offline writing metrics for essays. Word and page counts, readability scores, passive voice, repeated openers, filler words, long sentences and word limit checks, so students can check their work against assignment requirements. No account, no network. |
| [Job Application Tracker MCP](https://github.com/AnonymousOnyx22/job-tracker-student-mcp) | Job application tracker MCP server. Track internships, jobs, interviews and deadlines offline, see what is coming up, and export your list as CSV or Markdown. No account and no API keys. |

## license

mit


