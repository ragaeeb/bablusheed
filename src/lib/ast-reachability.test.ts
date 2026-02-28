import { describe, expect, it } from "bun:test";
import { stripUnreachableSymbols } from "./ast-reachability";

describe("stripUnreachableSymbols", () => {
  const run = (content: string, symbols: string[], ext: string) =>
    stripUnreachableSymbols(content, symbols, ext);

  const expectContainsAll = (value: string, snippets: string[]) => {
    for (const snippet of snippets) {
      expect(value).toContain(snippet);
    }
  };

  const expectContainsNone = (value: string, snippets: string[]) => {
    for (const snippet of snippets) {
      expect(value).not.toContain(snippet);
    }
  };

  it("should preserve exported const hook declarations in TS/TSX", () => {
    const input = `import quotesData from '@/assets/data/quotes.json';
import { getRandomQuote } from '@/lib/quotes';
import { useCurrentData } from '@/store/usePrayerStore';
import type { Quote } from '@/types/quote';

export type MotivationalQuoteState = { error: boolean; loading: boolean; quote: Quote | null };

export const useMotivationalQuote = (): MotivationalQuoteState => {
  const currentData = useCurrentData();
  const quote = currentData ? getRandomQuote(currentData, quotesData.quotes) : null;
  return { error: false, loading: false, quote };
};
`;
    const output = run(input, ["useMotivationalQuote"], "ts");
    expect(output).toContain("export const useMotivationalQuote");
    expect(output).toContain("getRandomQuote");
  });

  it("should preserve exported function and class declarations", () => {
    const input = `export function keepFn() { return 1; }
export class KeepClass {}
function dropFn() { return 0; }
class DropClass {}
`;
    const output = run(input, ["keepFn", "KeepClass", "dropFn", "DropClass"], "ts");
    expectContainsAll(output, ["export function keepFn", "export class KeepClass"]);
    expectContainsNone(output, ["function dropFn", "class DropClass"]);
  });

  it("should preserve named re-exported symbols from export lists", () => {
    const input = `const localFn = () => 1;
export { localFn };
`;
    const output = run(input, ["localFn"], "ts");
    expect(output).toContain("const localFn");
    expect(output).toContain("export { localFn }");
  });

  it("should preserve aliased named re-exported symbols", () => {
    const input = `const localFn = () => 1;
const dropFn = () => 2;
export { localFn as renamedLocalFn };
`;
    const output = run(input, ["localFn", "dropFn"], "ts");
    expect(output).toContain("const localFn");
    expect(output).toContain("renamedLocalFn");
    expect(output).not.toContain("dropFn");
  });

  it("should preserve default-exported function declarations", () => {
    const input = `export default function KeepDefault() { return 1; }
function DropMe() { return 2; }
`;
    const output = run(input, ["KeepDefault", "DropMe"], "ts");
    expect(output).toContain("export default function KeepDefault");
    expect(output).not.toContain("function DropMe");
  });

  it("should preserve default-exported const via export list", () => {
    const input = `const KeepViaDefault = () => 1;
const DropViaDefault = () => 2;
export { KeepViaDefault as default };
`;
    const output = run(input, ["KeepViaDefault", "DropViaDefault"], "ts");
    expect(output).toContain("KeepViaDefault");
    expect(output).toContain("as default");
    expect(output).not.toContain("DropViaDefault");
  });

  it("should remove non-exported const/function/class declarations when unreachable", () => {
    const input = `const deadConst = () => 1;
function deadFn() { return 2; }
class DeadClass {}
const aliveConst = () => 3;
`;
    const output = run(input, ["deadConst", "deadFn", "DeadClass"], "ts");
    expectContainsNone(output, ["deadConst", "deadFn", "DeadClass"]);
    expect(output).toContain("aliveConst");
  });

  it("should preserve indented declarations inside blocks", () => {
    const input = `if (true) {
  function nestedKeep() { return 1; }
}
function topLevelDrop() { return 2; }
`;
    const output = run(input, ["nestedKeep", "topLevelDrop"], "ts");
    expect(output).toContain("function nestedKeep");
    expect(output).not.toContain("function topLevelDrop");
  });

  it("should keep file unchanged when symbols list is empty", () => {
    const input = `function keepEverything() { return 1; }`;
    const output = run(input, [], "ts");
    expect(output).toBe(input);
  });

  it("should keep file unchanged when symbol does not exist", () => {
    const input = `function keepEverything() { return 1; }`;
    const output = run(input, ["notPresent"], "ts");
    expect(output).toBe(input);
  });

  it("should strip unreachable declarations in js and jsx extensions", () => {
    const js = `const deadConst = () => 1;
export const aliveConst = () => 2;
`;
    const jsx = `function deadComponent() { return <div />; }
export function AliveComponent() { return <section />; }
`;
    const jsOutput = run(js, ["deadConst"], "js");
    const jsxOutput = run(jsx, ["deadComponent"], "jsx");
    expect(jsOutput).not.toContain("deadConst");
    expect(jsOutput).toContain("aliveConst");
    expect(jsxOutput).not.toContain("deadComponent");
    expect(jsxOutput).toContain("AliveComponent");
  });

  it("should strip private python declarations while preserving following declarations", () => {
    const input = `def drop_fn():
    return 1

class DropClass:
    pass

def keep_fn():
    return 2

class KeepClass:
    pass
`;
    const output = run(input, ["drop_fn", "DropClass"], "py");
    expectContainsNone(output, ["def drop_fn", "class DropClass"]);
    expectContainsAll(output, ["def keep_fn", "class KeepClass"]);
  });

  it("should preserve rust pub enum/trait/type while removing private fn", () => {
    const input = `pub enum KeepEnum { A }
pub trait KeepTrait { fn a(&self); }
pub type KeepAlias = i32;
fn drop_private() {}
`;
    const output = run(input, ["KeepEnum", "KeepTrait", "KeepAlias", "drop_private"], "rs");
    expectContainsAll(output, ["pub enum KeepEnum", "pub trait KeepTrait", "pub type KeepAlias"]);
    expect(output).not.toContain("fn drop_private");
  });

  it("should preserve pub rust items", () => {
    const input = `pub fn keep_pub() {}
fn drop_private() {}
pub struct KeepType;
`;
    const output = run(input, ["keep_pub", "drop_private", "KeepType"], "rs");
    expect(output).toContain("pub fn keep_pub");
    expect(output).not.toContain("fn drop_private");
    expect(output).toContain("pub struct KeepType");
  });

  it("should preserve go exported symbols and remove private symbols", () => {
    const input = `func KeepPublic() {}
func dropPrivate() {}
`;
    const output = run(input, ["KeepPublic", "dropPrivate"], "go");
    expect(output).toContain("func KeepPublic");
    expect(output).not.toContain("func dropPrivate");
  });

  it("should strip multiline go functions by top-level declaration match", () => {
    const input = `func dropPrivate() {
  x := 1
  _ = x
}
`;
    const output = run(input, ["dropPrivate"], "go");
    expect(output).not.toContain("func dropPrivate");
  });

  it("should keep nested python defs while removing only top-level unreachable defs", () => {
    const input = `def drop_fn():
    return 1

class Keep:
    def drop_fn(self):
        return 2

def keep_fn():
    return 3
`;
    const output = run(input, ["drop_fn"], "py");
    expect(output).not.toContain("def drop_fn():");
    expect(output).toContain("def drop_fn(self):");
    expect(output).toContain("def keep_fn():");
  });

  it("should skip stripping for very large files to avoid unsafe regex behavior", () => {
    const hugeBody = "x".repeat(210_000);
    const input = `function hugeFn() { return "${hugeBody}"; }`;
    const output = run(input, ["hugeFn"], "ts");
    expect(output).toBe(input);
  });

  it("should leave unsupported language extensions unchanged", () => {
    const input = `private dead = true;`;
    const output = run(input, ["dead"], "swift");
    expect(output).toBe(input);
  });
});
