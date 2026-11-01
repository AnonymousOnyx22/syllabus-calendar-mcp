import { describe, it, expect } from "vitest";
import { extractEvents, fixTheTextHint } from "../src/extract.js";
import { tools } from "../src/tools.js";

describe("fixTheTextHint", () => {
  it("gives a generic hint when there are no undated lines", () => {
    const hint = fixTheTextHint([]);
    expect(hint).toContain("Add a date to each line");
    expect(hint).toContain("Sep 15");
    expect(hint).toContain("October 20, 2026 at 10:00");
  });
  it("lists one undated line", () => {
    const hint = fixTheTextHint(["Office hours by appointment"]);
    expect(hint).toContain("None of the 1 line named a date:");
    expect(hint).toContain("- Office hours by appointment");
    expect(hint).toContain("Add a date to each line");
  });
  it("lists several undated lines", () => {
    const hint = fixTheTextHint(["Office hours by appointment", "Review notes"]);
    expect(hint).toContain("None of the 2 lines named a date:");
    expect(hint).toContain("- Office hours by appointment");
    expect(hint).toContain("- Review notes");
    expect(hint).toContain("Add a date to each line");
  });
});

describe("extractEvents with no dates", () => {
  it("returns a count of 0 and keeps the undated lines", () => {
    const result = extractEvents("Office hours by appointment\nReview notes", { year: 2026 });
    expect(result.count).toBe(0);
    expect(result.undated_lines).toEqual(["Office hours by appointment", "Review notes"]);
  });
});

describe("extract_schedule_events with no dates", () => {
  it("gives text and next_step with the fix the text hint", async () => {
    const tool = tools.find((t) => t.name === "extract_schedule_events")!;
    const out = await tool.run({ text: "Office hours by appointment" }, null);
    expect(out.text).toContain("0 events found.");
    expect(out.text).toContain("- Office hours by appointment");
    expect((out.structured as { next_step: string }).next_step).toContain("Add a date to each line");
  });
});

describe("extractEvents with weekdays and date ranges", () => {
  it("drops a weekday name beside the date from the title", () => {
    const result = extractEvents("Mon Sep 14: Quiz 1\nProject proposal due Oct 2 (Fri)", { year: 2026 });
    expect(result.events.map((e) => [e.date, e.title])).toEqual([
      ["2026-09-14", "Quiz 1"],
      ["2026-10-02", "Project proposal"],
    ]);
  });
  it("keeps a date range as one event on the first day with the end in notes", () => {
    const result = extractEvents("Sep 14-18: Project work\nOct 5 to Oct 9 - Reading week\n12 Nov - 14 Nov Study break", { year: 2026 });
    expect(result.count).toBe(3);
    const byDate = Object.fromEntries(result.events.map((e) => [e.date, e]));
    expect(byDate["2026-09-14"].title).toBe("Project work");
    expect(byDate["2026-09-14"].notes).toBe("Runs to 2026-09-18.");
    expect(byDate["2026-10-05"].notes).toBe("Runs to 2026-10-09.");
    expect(byDate["2026-11-12"].notes).toBe("Runs to 2026-11-14.");
  });
  it("does not read a time after a dash as a range end", () => {
    const result = extractEvents("Sep 14 - 10:00 Quiz", { year: 2026 });
    expect(result.events[0].notes).toBeNull();
    expect(result.events[0].start_time).toBe("10:00");
  });
});
