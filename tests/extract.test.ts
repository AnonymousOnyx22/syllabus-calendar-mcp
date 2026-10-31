import { describe, it, expect } from "vitest";
import { extractEvents, fixTheTextHint } from "../src/extract.js";

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

describe("extractEvents zero event error", () => {
  it("includes the fix the text hint when no dates are found", () => {
    expect(() =>
      extractEvents("Office hours by appointment\nReview notes", { year: 2026 }),
    ).toThrow(/None of the 2 lines named a date:/);
  });
  it("lists the undated line in the thrown error", () => {
    expect(() => extractEvents("Office hours by appointment", { year: 2026 })).toThrow(
      /- Office hours by appointment/,
    );
  });
});
