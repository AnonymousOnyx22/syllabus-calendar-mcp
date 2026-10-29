import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { tools } from "../src/tools.js";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let client: Client;
beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: "calendar test", version: "0.0.0" });
  await client.connect(b);
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const r: any = await client.callTool({ name, arguments: args });
  return { text: r.content[0].text as string, structured: r.structuredContent as Record<string, unknown> | undefined, isError: !!r.isError };
}

describe("tools exist", () => {
  it("lists four tools", async () => {
    const listed = (await client.listTools()).tools;
    expect(listed.map((t) => t.name)).toEqual(["extract_schedule_events", "expand_recurring_classes", "build_ics", "merge_calendars"]);
    expect(listed.length).toBe(tools.length);
  });
  it("sets readOnly annotations", async () => {
    const listed = (await client.listTools()).tools;
    const byName = Object.fromEntries(listed.map((t) => [t.name, t]));
    expect((byName.extract_schedule_events as any).annotations.readOnlyHint).toBe(true);
    expect((byName.expand_recurring_classes as any).annotations.readOnlyHint).toBe(true);
    expect((byName.build_ics as any).annotations.readOnlyHint).toBe(false);
    expect((byName.merge_calendars as any).annotations.readOnlyHint).toBe(false);
    for (const t of listed) expect((t as any).annotations.openWorldHint).toBe(false);
  });
});

describe("extract_schedule_events", () => {
  it("extracts events from syllabus text", async () => {
    const r = await call("extract_schedule_events", { text: "Assignment 1 due Sep 15\nMidterm exam October 20 at 10:00", course: "BIO 101" });
    expect(r.isError).toBe(false);
    expect(r.structured?.count).toBe(2);
    expect((r.structured?.events as any[])[0].title).toContain("Assignment");
  });
  it("errors when no dates found", async () => {
    const r = await call("extract_schedule_events", { text: "Just some notes" });
    expect(r.isError).toBe(true);
  });
});

describe("expand_recurring_classes", () => {
  it("expands meetings and skips", async () => {
    const r = await call("expand_recurring_classes", { course: "BIO 101", weekdays: ["Tuesday", "Thursday"], start_date: "2026-09-08", end_date: "2026-12-10", start_time: "10:00", reading_weeks: ["2026-10-12 to 2026-10-16"] });
    expect(r.isError).toBe(false);
    expect((r.structured?.meetings as any[]).length).toBeGreaterThan(0);
    expect((r.structured?.skipped as any[]).length).toBeGreaterThan(0);
  });
});

describe("build_ics", () => {
  it("builds valid calendar", async () => {
    const r = await call("build_ics", { events: [{ title: "Assignment 1", type: "assignment", date: "2026-09-15" }], reminders_minutes: [1440] });
    expect(r.isError).toBe(false);
    expect(r.structured?.valid).toBe(true);
    expect((r.structured?.ics as string)).toContain("BEGIN:VCALENDAR");
    expect((r.structured?.ics as string)).toMatch(/\r\n/);
  });
  it("writes file when output_path passed", async () => {
    const path = join(tmpdir(), `test-${Date.now()}.ics`);
    try {
      const r = await call("build_ics", { events: [{ title: "Test", date: "2026-09-15" }], output_path: path });
      expect(r.isError).toBe(false);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf8");
      expect(content).toMatch(/\r\n/);
    } finally {
      if (existsSync(path)) unlinkSync(path);
    }
  });
});

describe("merge_calendars", () => {
  it("merges and finds conflicts", async () => {
    const ics1 = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AnonymousOnyx22//syllabus-calendar-mcp//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:One\r\nBEGIN:VEVENT\r\nUID:a@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260915T100000\r\nDTEND:20260915T110000\r\nSUMMARY:Class\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const ics2 = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AnonymousOnyx22//syllabus-calendar-mcp//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Two\r\nBEGIN:VEVENT\r\nUID:b@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260915T103000\r\nDTEND:20260915T113000\r\nSUMMARY:Other\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const r = await call("merge_calendars", { calendars: [{ name: "One", ics: ics1 }, { name: "Two", ics: ics2 }], calendar_name: "Merged" });
    expect(r.isError).toBe(false);
    expect((r.structured?.conflicts as any[]).length).toBe(1);
  });
  it("dedupes by uid", async () => {
    const ics1 = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AnonymousOnyx22//syllabus-calendar-mcp//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:One\r\nBEGIN:VEVENT\r\nUID:same@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260915T100000\r\nDTEND:20260915T110000\r\nSUMMARY:Class\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const ics2 = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AnonymousOnyx22//syllabus-calendar-mcp//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Two\r\nBEGIN:VEVENT\r\nUID:same@x\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260915T100000\r\nDTEND:20260915T110000\r\nSUMMARY:Class\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const r = await call("merge_calendars", { calendars: [{ name: "One", ics: ics1 }, { name: "Two", ics: ics2 }] });
    expect(r.isError).toBe(false);
    expect(r.structured?.event_count).toBe(1);
  });
});
