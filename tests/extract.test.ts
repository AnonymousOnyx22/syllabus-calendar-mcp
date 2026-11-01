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
