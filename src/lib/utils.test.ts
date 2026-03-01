import { describe, expect, it, mock } from "bun:test";
import {
  cn,
  debounce,
  formatFileSize,
  formatTokenCount,
  getFileIcon,
  minifyMarkdown,
  reduceWhitespace,
  stripComments,
} from "./utils";

describe("cn", () => {
  it("should merge class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("should handle conditional class names", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("should merge conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("should return empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});

describe("formatTokenCount", () => {
  it("should format millions", () => {
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
    expect(formatTokenCount(1_000_000)).toBe("1.0M");
  });

  it("should format thousands", () => {
    expect(formatTokenCount(12_500)).toBe("12.5k");
    expect(formatTokenCount(1_000)).toBe("1.0k");
  });

  it("should return raw number below 1000", () => {
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(1)).toBe("1");
  });
});

describe("formatFileSize", () => {
  it("should format megabytes", () => {
    expect(formatFileSize(1_500_000)).toBe("1.5 MB");
    expect(formatFileSize(1_000_000)).toBe("1.0 MB");
  });

  it("should format kilobytes", () => {
    expect(formatFileSize(12_500)).toBe("12.5 KB");
    expect(formatFileSize(1_000)).toBe("1.0 KB");
  });

  it("should format bytes", () => {
    expect(formatFileSize(999)).toBe("999 B");
    expect(formatFileSize(0)).toBe("0 B");
  });
});

describe("getFileIcon", () => {
  it("should return known icon types", () => {
    const expectations: Record<string, string> = {
      ts: "typescript",
      tsx: "react",
      js: "javascript",
      jsx: "react",
      rs: "rust",
      py: "python",
      go: "go",
      md: "markdown",
      json: "json",
      css: "css",
      html: "html",
      toml: "toml",
      yaml: "yaml",
      yml: "yaml",
      sh: "shell",
      bash: "shell",
      txt: "text",
    };
    for (const [ext, expected] of Object.entries(expectations)) {
      expect(getFileIcon(ext)).toBe(expected);
    }
  });

  it("should return 'file' for unknown extensions", () => {
    expect(getFileIcon("xyz")).toBe("file");
    expect(getFileIcon("")).toBe("file");
  });

  it("should be case-insensitive", () => {
    expect(getFileIcon("TS")).toBe("typescript");
    expect(getFileIcon("JSON")).toBe("json");
    expect(getFileIcon("Py")).toBe("python");
  });
});

describe("debounce", () => {
  it("should delay execution until after the delay", async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 100));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should reset timer on subsequent calls", async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 60);
    debounced();
    await new Promise((r) => setTimeout(r, 30));
    debounced();
    await new Promise((r) => setTimeout(r, 30));
    expect(fn).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should pass arguments to the debounced function", async () => {
    const fn = mock((..._args: unknown[]) => {});
    const debounced = debounce(fn, 30);
    debounced("a", 42);
    await new Promise((r) => setTimeout(r, 80));
    expect(fn).toHaveBeenCalledWith("a", 42);
  });
});

describe("stripComments", () => {
  describe("C-style languages", () => {
    it("should remove single-line // comments", () => {
      const input = "const x = 1; // inline\n// full line\nconst y = 2;";
      const result = stripComments(input, "ts");
      expect(result).toContain("const x = 1;");
      expect(result).toContain("const y = 2;");
      expect(result).not.toContain("inline");
      expect(result).not.toContain("full line");
    });

    it("should remove multi-line /* */ comments", () => {
      const input = "const x = 1;\n/* multi\nline */\nconst y = 2;";
      const result = stripComments(input, "ts");
      expect(result).not.toContain("multi");
      expect(result).toContain("const x = 1;");
      expect(result).toContain("const y = 2;");
    });

    it("should handle all C-style extensions", () => {
      for (const ext of ["ts", "tsx", "js", "jsx", "rs", "go", "c", "cpp", "h", "cs", "java"]) {
        const result = stripComments("code(); // comment", ext);
        expect(result).not.toContain("comment");
      }
    });

    it("should handle empty input", () => {
      expect(stripComments("", "ts")).toBe("");
    });

    it("should return unchanged input with no comments", () => {
      const input = "const x = 1;\nconst y = 2;";
      expect(stripComments(input, "ts")).toBe(input);
    });

    it("should handle nested-looking block comments", () => {
      const input = "a;\n/* outer /* inner */ b;\nc;";
      const result = stripComments(input, "ts");
      expect(result).toContain("a;");
      expect(result).toContain("b;");
      expect(result).not.toContain("outer");
    });
  });

  describe("hash-comment languages", () => {
    it("should remove # comments from Python", () => {
      const input = "x = 1  # comment\n# full line\ny = 2";
      const result = stripComments(input, "py");
      expect(result).toContain("x = 1");
      expect(result).toContain("y = 2");
      expect(result).not.toContain("# comment");
    });

    it("should preserve shebang on first line", () => {
      const input = "#!/usr/bin/env python\n# comment\nprint('hi')";
      const result = stripComments(input, "py");
      expect(result).toContain("#!/usr/bin/env python");
      expect(result).not.toContain("# comment");
    });

    it("should not strip # inside double-quoted strings", () => {
      const input = 'x = "contains # hash"\ny = 1  # real';
      const result = stripComments(input, "py");
      expect(result).toContain("contains # hash");
      expect(result).not.toContain("# real");
    });

    it("should not strip # inside single-quoted strings", () => {
      const input = "x = 'has # hash'\ny = 1  # real";
      const result = stripComments(input, "py");
      expect(result).toContain("has # hash");
      expect(result).not.toContain("# real");
    });

    it("should handle escaped quotes inside strings", () => {
      const input = 'x = "escaped \\"quote# not comment"\n# real';
      const result = stripComments(input, "py");
      expect(result).toContain("escaped");
      expect(result).not.toContain("# real");
    });

    it("should strip Python module-level docstrings", () => {
      const input = '"""Module docstring"""\n\nx = 1';
      const result = stripComments(input, "py");
      expect(result).not.toContain("Module docstring");
      expect(result).toContain("x = 1");
    });

    it("should strip Python def docstrings", () => {
      const input = 'def foo():\n    """Docstring"""\n    return 1';
      const result = stripComments(input, "py");
      expect(result).not.toContain("Docstring");
      expect(result).toContain("def foo():");
    });

    it("should strip Python class docstrings", () => {
      const input = 'class Foo:\n    """Class doc"""\n    pass';
      const result = stripComments(input, "py");
      expect(result).not.toContain("Class doc");
      expect(result).toContain("class Foo:");
    });

    it("should work for all hash-comment extensions", () => {
      for (const ext of ["py", "rb", "sh", "bash", "yaml", "yml", "toml", "r"]) {
        const result = stripComments("code # comment", ext);
        expect(result).not.toContain("# comment");
      }
    });
  });

  describe("dash-comment languages", () => {
    it("should remove -- comments from SQL", () => {
      const input = "SELECT * FROM t; -- comment\n-- full\nINSERT INTO t;";
      const result = stripComments(input, "sql");
      expect(result).not.toContain("-- comment");
      expect(result).not.toContain("-- full");
      expect(result).toContain("SELECT * FROM t;");
    });

    it("should work for lua", () => {
      const result = stripComments("local x = 1 -- comment", "lua");
      expect(result).not.toContain("-- comment");
      expect(result).toContain("local x = 1");
    });
  });

  describe("unsupported languages", () => {
    it("should return content unchanged", () => {
      const input = "content # with hashes // and slashes -- and dashes";
      expect(stripComments(input, "xyz")).toBe(input);
      expect(stripComments(input, "")).toBe(input);
    });
  });
});

describe("reduceWhitespace", () => {
  it("should collapse multiple blank lines into one", () => {
    const result = reduceWhitespace("a\n\n\n\nb");
    expect(result).toBe("a\n\nb");
  });

  it("should trim trailing whitespace from lines", () => {
    const result = reduceWhitespace("foo   \nbar  ");
    expect(result).not.toMatch(/ {2,}$/m);
  });

  it("should fully left-align whitespace-insensitive files", () => {
    const result = reduceWhitespace("  indented\n    more", "ts");
    expect(result).toBe("indented\nmore");
  });

  it("should preserve indentation for Python", () => {
    const result = reduceWhitespace("def foo():\n    return 1", "py");
    expect(result).toContain("    return 1");
  });

  it("should preserve indentation for YAML", () => {
    const result = reduceWhitespace("key:\n  value: 1", "yaml");
    expect(result).toContain("  value: 1");
  });

  it("should preserve indentation for yml extension", () => {
    const result = reduceWhitespace("key:\n  value: 1", "yml");
    expect(result).toContain("  value: 1");
  });

  it("should preserve indentation for Makefile by filename", () => {
    const result = reduceWhitespace("target:\n\tcommand", undefined, "Makefile");
    expect(result).toContain("\tcommand");
  });

  it("should preserve indentation for GNUmakefile (case-insensitive)", () => {
    const result = reduceWhitespace("target:\n\tcommand", undefined, "GNUmakefile");
    expect(result).toContain("\tcommand");
  });

  it("should trim leading/trailing whitespace from entire content", () => {
    expect(reduceWhitespace("\n\nfoo\n\n")).toBe("foo");
  });

  it("should handle empty input", () => {
    expect(reduceWhitespace("")).toBe("");
  });

  it("should handle content with only whitespace", () => {
    expect(reduceWhitespace("   \n\n   ")).toBe("");
  });
});

describe("minifyMarkdown", () => {
  it("should strip badge image links", () => {
    const input = "# Title\n[![badge](http://img.svg)](http://link)\nContent";
    const result = minifyMarkdown(input, false, false);
    expect(result).not.toContain("badge");
    expect(result).toContain("# Title");
    expect(result).toContain("Content");
  });

  it("should strip HTML comments", () => {
    const result = minifyMarkdown("Before\n<!-- comment -->\nAfter", false, false);
    expect(result).not.toContain("comment");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  it("should strip multi-line HTML comments", () => {
    const result = minifyMarkdown("Before\n<!--\nmulti\nline\n-->\nAfter", false, false);
    expect(result).not.toContain("multi");
  });

  it("should strip block HTML tags with content", () => {
    const result = minifyMarkdown("Before\n<div class='x'>inner</div>\nAfter", false, false);
    expect(result).not.toContain("<div");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  it("should strip table HTML tags", () => {
    const result = minifyMarkdown("<table><tr><td>cell</td></tr></table>\nAfter", false, false);
    expect(result).not.toContain("<table");
    expect(result).toContain("After");
  });

  it("should strip void/self-closing HTML tags", () => {
    const result = minifyMarkdown("A\n<img src='x' />\n<br>\n<hr />\nB", false, false);
    expect(result).not.toContain("<img");
    expect(result).not.toContain("<br");
    expect(result).not.toContain("<hr");
  });

  it("should strip remaining HTML tags but keep inner text", () => {
    const result = minifyMarkdown("Before <span>text</span> After", false, false);
    expect(result).not.toContain("<span>");
    expect(result).not.toContain("</span>");
    expect(result).toContain("text");
  });

  it("should collapse multiple blank lines", () => {
    expect(minifyMarkdown("A\n\n\n\nB", false, false)).toBe("A\n\nB");
  });

  it("should strip headings when enabled", () => {
    const result = minifyMarkdown("# H1\n## H2\n### H3\nContent", true, false);
    expect(result).not.toContain("# H1");
    expect(result).not.toContain("## H2");
    expect(result).not.toContain("### H3");
    expect(result).toContain("Content");
  });

  it("should preserve headings when disabled", () => {
    const result = minifyMarkdown("# H1\nContent", false, false);
    expect(result).toContain("# H1");
  });

  it("should strip blockquotes when enabled", () => {
    const result = minifyMarkdown("> Quote\n> Another\nNormal", false, true);
    expect(result).not.toContain("> Quote");
    expect(result).toContain("Normal");
  });

  it("should preserve blockquotes when disabled", () => {
    const result = minifyMarkdown("> Quote\nNormal", false, false);
    expect(result).toContain("> Quote");
  });

  it("should strip both headings and blockquotes together", () => {
    const result = minifyMarkdown("# Title\n> Quote\nContent", true, true);
    expect(result).not.toContain("# Title");
    expect(result).not.toContain("> Quote");
    expect(result).toContain("Content");
  });

  it("should handle empty input", () => {
    expect(minifyMarkdown("", false, false)).toBe("");
  });
});
