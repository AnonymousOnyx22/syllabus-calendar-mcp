import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tools } from "../src/tools.js";

const readJson = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const readText = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("metadata drift", () => {
  it("glama.json tool names match source", () => {
    const glama = readJson("glama.json");
    const sourceNames = tools.map((t) => t.name).sort();
    const glamaNames = glama.tools.map((t: any) => t.name).sort();
    expect(glamaNames).toEqual(sourceNames);
  });
  it("glama.json parameter names match source", () => {
    const glama = readJson("glama.json");
    for (const tool of tools) {
      const g = glama.tools.find((t: any) => t.name === tool.name);
      const sourceParams = Object.keys(tool.inputSchema).sort();
      const glamaParams = g.parameters.map((p: any) => p.name).sort();
      expect(glamaParams, tool.name).toEqual(sourceParams);
    }
  });
  it("llms.txt lists the same tools", () => {
    const llms = readText("llms.txt");
    const names = tools.map((t) => t.name);
    const line = (llms.match(/Tools: ([^\n]+)/) || [])[1] || "";
    const listed = line.split(/,\s*/).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean);
    expect(listed.sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(llms.includes(`### ${name}`), name).toBe(true);
    }
  });
  it("llms.txt parameter names match source", () => {
    const llms = readText("llms.txt");
    for (const tool of tools) {
      const section = llms.split(`### ${tool.name}`)[1]?.split("### ")[0] ?? "";
      const m = section.match(/Parameters: (.+)\./);
      const listed = ((m?.[1] ?? "").match(/\w+(?= \()/g) || []).filter(Boolean);
      const sourceParams = Object.keys(tool.inputSchema);
      expect(listed.sort(), tool.name).toEqual([...sourceParams].sort());
    }
  });
});



