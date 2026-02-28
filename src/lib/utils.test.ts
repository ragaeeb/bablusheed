import { describe, expect, it } from "bun:test";
import { stripComments } from "./utils";

describe("stripComments", () => {
  it("should strip C-style comments without corrupting URLs or string literals", () => {
    const input = [
      'const url = "https://example.com/api"; // remove this',
      'const msg = "use // in docs";',
      "/* remove block */",
      "const ok = 1;",
    ].join("\n");

    const output = stripComments(input, "ts");

    expect(output).toContain('const url = "https://example.com/api";');
    expect(output).toContain('const msg = "use // in docs";');
    expect(output).toContain("const ok = 1;");
    expect(output).not.toContain("remove this");
    expect(output).not.toContain("remove block");
  });

  it("should preserve comment-like tokens inside template literals", () => {
    const input = [
      "const tpl = `line // still content",
      "/* still content */",
      "`;",
      "const x = 1; // trim",
    ].join("\n");

    const output = stripComments(input, "tsx");

    expect(output).toContain("line // still content");
    expect(output).toContain("/* still content */");
    expect(output).toContain("const x = 1;");
    expect(output).not.toContain("// trim");
  });

  it("should strip SQL/Lua dash comments while preserving quoted -- content", () => {
    const input = [
      "SELECT 'foo--bar' as value; -- remove this",
      'SELECT "alpha--beta" as label; -- remove this too',
      "SELECT 1;",
    ].join("\n");

    const output = stripComments(input, "sql");

    expect(output).toContain("SELECT 'foo--bar' as value;");
    expect(output).toContain('SELECT "alpha--beta" as label;');
    expect(output).toContain("SELECT 1;");
    expect(output).not.toContain("remove this");
  });
});
