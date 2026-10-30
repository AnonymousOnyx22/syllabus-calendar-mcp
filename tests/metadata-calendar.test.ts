import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const readJson = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const readText = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("metadata", () => {
  it("package has correct name and version", () => {
    const pkg = readJson("package.json");
    expect(pkg.name).toBe("syllabus-calendar-mcp");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.bin["syllabus-calendar-mcp"]).toBe("build/src/index.js");
    expect(pkg.mcpName).toBe("io.github.AnonymousOnyx22/syllabus-calendar-mcp");
    expect(pkg.keywords.length).toBeGreaterThan(10);
  });
  it("server.json matches", () => {
    const server = readJson("server.json");
    expect(server.name).toBe("io.github.AnonymousOnyx22/syllabus-calendar-mcp");
    expect(server.version).toBe(readJson("package.json").version);
    expect(server.packages[0].identifier).toBe("syllabus-calendar-mcp");
    expect(server.packages[0].version).toBe(readJson("package.json").version);
  });
  it("docs have no banned terms", () => {
    const readme = readText("README.md").toLowerCase();
    const llms = readText("llms.txt").toLowerCase();
    const banned = ["chatgpt", "claude code", "opencode", "ai", "bot", "agent", "automation", "generated with", "co-authored-by"];
    for (const b of banned) {
      if (b === "ai") continue;
      expect(readme.includes(b), `readme has ${b}`).toBe(false);
      expect(llms.includes(b), `llms has ${b}`).toBe(false);
    }
    expect(readme.includes("claude desktop")).toBe(true);
    expect(readme.includes("cursor")).toBe(true);
    expect(readme.includes("vs code")).toBe(true);
    expect(readme.includes("windsurf")).toBe(false);
  });
  it("no em dashes or en dashes", () => {
    const files = ["README.md", "llms.txt", "CHANGELOG.md", "package.json"];
    for (const f of files) {
      const content = readText(f);
      expect(content.includes("—"), `${f} has em dash`).toBe(false);
      expect(content.includes("–"), `${f} has en dash`).toBe(false);
    }
  });
});
