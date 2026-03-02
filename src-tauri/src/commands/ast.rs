use crate::models::{FileContent, ReachabilityResult};
use std::collections::{HashMap, HashSet, VecDeque};
use tree_sitter::{Node, Parser};

fn get_language(extension: &str) -> Option<tree_sitter::Language> {
    match extension {
        "ts" => Some(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        "tsx" => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
        "js" | "jsx" => Some(tree_sitter_javascript::LANGUAGE.into()),
        "py" => Some(tree_sitter_python::LANGUAGE.into()),
        "rs" => Some(tree_sitter_rust::LANGUAGE.into()),
        "go" => Some(tree_sitter_go::LANGUAGE.into()),
        _ => None,
    }
}

fn get_extension(path: &str) -> &str {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
}

/// Extract top-level symbol names from a parsed AST
fn extract_symbols(source: &[u8], tree: &tree_sitter::Tree) -> Vec<String> {
    let root = tree.root_node();
    let mut symbols = Vec::new();
    extract_symbols_from_node(root, source, 0, &mut symbols);
    symbols
}

fn node_text<'a>(node: Node, source: &'a [u8]) -> &'a str {
    node.utf8_text(source).unwrap_or("")
}

fn extract_symbols_from_node(
    node: Node,
    source: &[u8],
    depth: usize,
    symbols: &mut Vec<String>,
) {
    if depth > 2 {
        return;
    }

    match node.kind() {
        // JavaScript/TypeScript
        "function" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                symbols.push(node_text(name_node, source).to_string());
            }
        }
        "class_declaration" | "class" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                symbols.push(node_text(name_node, source).to_string());
            }
        }
        "lexical_declaration" | "variable_declaration" => {
            // const foo = ... or let foo = ...
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "variable_declarator" {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        symbols.push(node_text(name_node, source).to_string());
                    }
                }
            }
        }
        "export_statement" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                extract_symbols_from_node(child, source, depth + 1, symbols);
            }
        }
        // Python
        "function_definition" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                symbols.push(node_text(name_node, source).to_string());
            }
        }
        "class_definition" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                symbols.push(node_text(name_node, source).to_string());
            }
        }
        // Rust
        "function_item" | "impl_item" | "struct_item" | "enum_item" | "trait_item" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                symbols.push(node_text(name_node, source).to_string());
            }
        }
        // Go
        "function_declaration" | "method_declaration" | "type_declaration" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                symbols.push(node_text(name_node, source).to_string());
            }
        }
        _ => {}
    }

    // Recurse for program/module top level
    if matches!(node.kind(), "program" | "module" | "source_file" | "translation_unit") {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            extract_symbols_from_node(child, source, depth, symbols);
        }
    }
}

/// Find all identifier references in a node (for call graph building)
fn collect_references(node: Node, source: &[u8], refs: &mut HashSet<String>) {
    if node.kind() == "identifier"
        || node.kind() == "type_identifier"
        || node.kind() == "jsx_identifier"
    {
        let name = node_text(node, source);
        let is_jsx = node.kind() == "jsx_identifier";
        let first = name.chars().next();
        let is_valid_ident = first.map(|c| c.is_alphabetic() || c == '_').unwrap_or(false);
        let is_component_like_jsx = first.map(|c| c.is_uppercase()).unwrap_or(false);
        if !name.is_empty() && is_valid_ident && (!is_jsx || is_component_like_jsx) {
            refs.insert(name.to_string());
        }
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_references(child, source, refs);
    }
}

fn collect_symbol_references(source: &[u8], tree: &tree_sitter::Tree) -> HashMap<String, HashSet<String>> {
    let mut map: HashMap<String, HashSet<String>> = HashMap::new();
    collect_symbol_references_from_node(tree.root_node(), source, 0, &mut map);
    map
}

fn insert_symbol_references(
    symbol_refs: &mut HashMap<String, HashSet<String>>,
    source: &[u8],
    name: String,
    scope_node: Node,
) {
    let mut refs = HashSet::new();
    collect_references(scope_node, source, &mut refs);
    refs.remove(&name);
    symbol_refs
        .entry(name)
        .or_default()
        .extend(refs.into_iter());
}

fn collect_symbol_references_from_node(
    node: Node,
    source: &[u8],
    depth: usize,
    symbol_refs: &mut HashMap<String, HashSet<String>>,
) {
    if depth > 2 {
        return;
    }

    match node.kind() {
        "function_declaration"
        | "function"
        | "class_declaration"
        | "class"
        | "function_definition"
        | "class_definition"
        | "function_item"
        | "impl_item"
        | "struct_item"
        | "enum_item"
        | "trait_item"
        | "method_declaration"
        | "type_declaration" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = node_text(name_node, source).to_string();
                insert_symbol_references(symbol_refs, source, name, node);
            }
        }
        "lexical_declaration" | "variable_declaration" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "variable_declarator" {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = node_text(name_node, source).to_string();
                        insert_symbol_references(symbol_refs, source, name, child);
                    }
                }
            }
        }
        "export_statement" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                collect_symbol_references_from_node(child, source, depth + 1, symbol_refs);
            }
        }
        _ => {}
    }

    if matches!(node.kind(), "program" | "module" | "source_file" | "translation_unit") {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            collect_symbol_references_from_node(child, source, depth, symbol_refs);
        }
    }
}

fn parse_import_clause_bindings(clause_text: &str) -> Vec<(String, String)> {
    let mut bindings = Vec::new();
    let text = clause_text.trim();
    if text.is_empty() {
        return bindings;
    }

    let mut parts = text.splitn(2, ',');
    let first = parts.next().unwrap_or("").trim();
    let second = parts.next().map(str::trim);

    if !first.is_empty() && !first.starts_with('{') && !first.starts_with('*') {
        bindings.push((first.to_string(), "default".to_string()));
    }

    let named_segment = if first.starts_with('{') || first.starts_with('*') {
        Some(first)
    } else {
        second
    };

    if let Some(segment) = named_segment {
        if segment.starts_with('*') {
            if let Some((_, local)) = segment.split_once(" as ") {
                let local_trimmed = local.trim();
                if !local_trimmed.is_empty() {
                    bindings.push((local_trimmed.to_string(), "*".to_string()));
                }
            }
        } else if segment.starts_with('{') && segment.ends_with('}') {
            let inner = &segment[1..segment.len() - 1];
            for raw_spec in inner.split(',') {
                let mut spec = raw_spec.trim();
                if spec.is_empty() {
                    continue;
                }
                if let Some(stripped) = spec.strip_prefix("type ") {
                    spec = stripped.trim();
                }
                if let Some((imported, local)) = spec.split_once(" as ") {
                    let imported_trimmed = imported.trim();
                    let local_trimmed = local.trim();
                    if !imported_trimmed.is_empty() && !local_trimmed.is_empty() {
                        bindings.push((local_trimmed.to_string(), imported_trimmed.to_string()));
                    }
                } else {
                    bindings.push((spec.to_string(), spec.to_string()));
                }
            }
        }
    }

    bindings
}

fn extract_import_aliases(source: &[u8], tree: &tree_sitter::Tree) -> HashMap<String, (String, String)> {
    let mut aliases = HashMap::new();
    let root = tree.root_node();
    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        if child.kind() != "import_statement" {
            continue;
        }

        let mut source_path: Option<String> = None;
        let mut clause_text: Option<String> = None;
        let mut import_cursor = child.walk();
        for import_child in child.children(&mut import_cursor) {
            if import_child.kind() == "import_clause" {
                clause_text = Some(node_text(import_child, source).to_string());
            } else if import_child.kind() == "identifier" && clause_text.is_none() {
                // Fallback for grammars that expose default imports directly.
                clause_text = Some(node_text(import_child, source).to_string());
            } else if import_child.kind() == "string" {
                let raw = node_text(import_child, source).trim();
                if (raw.starts_with('"') && raw.ends_with('"'))
                    || (raw.starts_with('\'') && raw.ends_with('\''))
                {
                    source_path = Some(raw[1..raw.len() - 1].to_string());
                } else {
                    source_path = Some(raw.to_string());
                }
            }
        }

        let Some(specifier) = source_path else {
            continue;
        };
        let Some(clause) = clause_text else {
            continue;
        };
        for (local_name, imported_name) in parse_import_clause_bindings(&clause) {
            aliases.insert(local_name, (imported_name, specifier.clone()));
        }
    }
    aliases
}

fn normalize_path(path: &std::path::Path) -> String {
    use std::path::Component;

    let mut prefix = String::new();
    let mut has_root = false;
    let mut parts: Vec<String> = Vec::new();

    for component in path.components() {
        match component {
            Component::Prefix(p) => {
                prefix = p.as_os_str().to_string_lossy().to_string();
            }
            Component::RootDir => {
                has_root = true;
            }
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = parts.pop();
            }
            Component::Normal(segment) => {
                parts.push(segment.to_string_lossy().to_string());
            }
        }
    }

    let mut normalized = String::new();
    if !prefix.is_empty() {
        normalized.push_str(&prefix);
        if has_root {
            normalized.push('/');
        }
    } else if has_root {
        normalized.push('/');
    }
    normalized.push_str(&parts.join("/"));
    normalized
}

fn resolve_import_target_file(
    current_file: &str,
    import_specifier: &str,
    known_files: &HashSet<String>,
) -> Option<String> {
    if !import_specifier.starts_with('.') {
        return None;
    }

    let current_path = std::path::Path::new(current_file);
    let base_dir = current_path.parent()?;
    let joined = base_dir.join(import_specifier);
    let joined_string = normalize_path(&joined);

    let mut candidates = vec![joined_string.clone()];
    for ext in ["ts", "tsx", "js", "jsx"] {
        candidates.push(format!("{joined_string}.{ext}"));
        candidates.push(format!("{joined_string}/index.{ext}"));
    }

    candidates
        .into_iter()
        .find(|candidate| known_files.contains(candidate))
}

fn extract_default_export_symbol(source: &str) -> Option<String> {
    for line in source.lines() {
        let trimmed = line.trim_start();
        let Some(after) = trimmed.strip_prefix("export default ") else {
            continue;
        };
        let without_comment = after.split("//").next().unwrap_or("").trim();
        let expression = without_comment.trim_end_matches(';').trim();
        if expression.is_empty() {
            continue;
        }
        if expression.starts_with("function ") || expression.starts_with("class ") {
            continue;
        }
        let token = expression
            .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '$'))
            .next()
            .unwrap_or("");
        if token.is_empty() {
            continue;
        }
        let first = token.chars().next();
        if first.map(|c| c.is_alphabetic() || c == '_' || c == '$').unwrap_or(false) {
            return Some(token.to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn analyze_reachability(
    entry_point: String,
    files: Vec<FileContent>,
) -> Result<ReachabilityResult, String> {
    let mut symbol_map: HashMap<String, String> = HashMap::new(); // symbol -> file_path
    let mut file_symbols: HashMap<String, Vec<String>> = HashMap::new(); // file_path -> symbols
    let mut file_refs: HashMap<String, HashSet<String>> = HashMap::new(); // symbol -> refs
    let mut file_level_refs: HashMap<String, HashSet<String>> = HashMap::new(); // file_path -> refs
    let mut import_aliases_by_file: HashMap<String, HashMap<String, (String, String)>> = HashMap::new();
    let mut default_export_symbol_by_file: HashMap<String, String> = HashMap::new();

    // Parse all files and extract symbols + refs
    for file in &files {
        let ext = get_extension(&file.path);
        let lang_opt = get_language(ext);
        let Some(language) = lang_opt else {
            continue;
        };

        let mut parser = Parser::new();
        if parser.set_language(&language).is_err() {
            continue;
        }

        let source = file.content.as_bytes();
        let tree = match parser.parse(source, None) {
            Some(t) => t,
            None => continue,
        };

        let symbols = extract_symbols(source, &tree);
        let refs_by_symbol = collect_symbol_references(source, &tree);
        let import_aliases = extract_import_aliases(source, &tree);
        if !import_aliases.is_empty() {
            import_aliases_by_file.insert(file.path.clone(), import_aliases);
        }

        if let Some(default_export) = extract_default_export_symbol(&file.content) {
            default_export_symbol_by_file.insert(file.path.clone(), default_export);
        }

        let mut refs_for_file = HashSet::new();
        collect_references(tree.root_node(), source, &mut refs_for_file);
        file_level_refs.insert(file.path.clone(), refs_for_file);

        for sym in &symbols {
            symbol_map.insert(sym.clone(), file.path.clone());
            if let Some(refs) = refs_by_symbol.get(sym) {
                file_refs.insert(sym.clone(), refs.clone());
            } else {
                file_refs.insert(sym.clone(), HashSet::new());
            }
        }

        file_symbols.insert(file.path.clone(), symbols);
    }

    // BFS from entry point
    let entry_symbols = file_symbols.get(&entry_point).cloned().unwrap_or_default();

    let mut reachable: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<String> = VecDeque::new();
    let known_files: HashSet<String> = file_symbols.keys().cloned().collect();

    for sym in &entry_symbols {
        reachable.insert(sym.clone());
        queue.push_back(sym.clone());
    }
    if let Some(entry_refs) = file_level_refs.get(&entry_point) {
        let import_aliases = import_aliases_by_file.get(&entry_point);
        for sym in entry_refs {
            if symbol_map.contains_key(sym) && reachable.insert(sym.clone()) {
                queue.push_back(sym.clone());
                continue;
            }

            let Some((imported_name, import_specifier)) =
                import_aliases.and_then(|m| m.get(sym))
            else {
                continue;
            };
            let Some(target_file) =
                resolve_import_target_file(&entry_point, import_specifier, &known_files)
            else {
                continue;
            };

            let mapped_symbol = if imported_name == "default" {
                default_export_symbol_by_file.get(&target_file).cloned()
            } else {
                Some(imported_name.clone())
            };

            if let Some(candidate) = mapped_symbol {
                if symbol_map
                    .get(&candidate)
                    .map(|owner| owner == &target_file)
                    .unwrap_or(false)
                    && reachable.insert(candidate.clone())
                {
                    queue.push_back(candidate);
                }
            }
        }
    }

    while let Some(sym) = queue.pop_front() {
        if let Some(refs) = file_refs.get(&sym) {
            for r in refs {
                if !reachable.contains(r) && symbol_map.contains_key(r) {
                    reachable.insert(r.clone());
                    queue.push_back(r.clone());
                }
            }
        }
    }

    // Build result
    let mut reachable_symbols: HashMap<String, Vec<String>> = HashMap::new();
    let mut unreachable_symbols: HashMap<String, Vec<String>> = HashMap::new();

    for (file_path, symbols) in &file_symbols {
        let mut reach = Vec::new();
        let mut unreach = Vec::new();
        for sym in symbols {
            if reachable.contains(sym) {
                reach.push(sym.clone());
            } else {
                unreach.push(sym.clone());
            }
        }
        if !reach.is_empty() {
            reachable_symbols.insert(file_path.clone(), reach);
        }
        if !unreach.is_empty() {
            unreachable_symbols.insert(file_path.clone(), unreach);
        }
    }

    Ok(ReachabilityResult {
        reachable_symbols,
        unreachable_symbols,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── get_extension ──

    #[test]
    fn get_extension_extracts_ext() {
        assert_eq!(get_extension("foo.ts"), "ts");
        assert_eq!(get_extension("path/to/file.rs"), "rs");
        assert_eq!(get_extension("Makefile"), "");
    }

    // ── get_language ──

    #[test]
    fn get_language_returns_some_for_supported() {
        assert!(get_language("ts").is_some());
        assert!(get_language("tsx").is_some());
        assert!(get_language("js").is_some());
        assert!(get_language("jsx").is_some());
        assert!(get_language("py").is_some());
        assert!(get_language("rs").is_some());
        assert!(get_language("go").is_some());
    }

    #[test]
    fn get_language_returns_none_for_unsupported() {
        assert!(get_language("java").is_none());
        assert!(get_language("rb").is_none());
        assert!(get_language("").is_none());
        assert!(get_language("md").is_none());
    }

    // ── extract_symbols ──

    fn parse_and_extract(source: &str, ext: &str) -> Vec<String> {
        let lang = get_language(ext).unwrap();
        let mut parser = Parser::new();
        parser.set_language(&lang).unwrap();
        let tree = parser.parse(source.as_bytes(), None).unwrap();
        extract_symbols(source.as_bytes(), &tree)
    }

    #[test]
    fn extract_ts_function_declaration() {
        let symbols = parse_and_extract("function foo() { return 1; }\nfunction bar() {}", "ts");
        assert!(symbols.contains(&"foo".to_string()));
        assert!(symbols.contains(&"bar".to_string()));
    }

    #[test]
    fn extract_ts_const_declaration() {
        let symbols = parse_and_extract("const x = 1;\nlet y = 2;\nvar z = 3;", "ts");
        assert!(symbols.contains(&"x".to_string()));
        assert!(symbols.contains(&"y".to_string()));
        assert!(symbols.contains(&"z".to_string()));
    }

    #[test]
    fn extract_ts_exported_symbols() {
        let symbols = parse_and_extract("export function foo() {}\nexport const bar = 1;", "ts");
        assert!(symbols.contains(&"foo".to_string()));
        assert!(symbols.contains(&"bar".to_string()));
    }

    #[test]
    fn extract_ts_class_declaration() {
        let symbols = parse_and_extract("class MyClass {}\nexport class Other {}", "ts");
        assert!(symbols.contains(&"MyClass".to_string()));
        assert!(symbols.contains(&"Other".to_string()));
    }

    #[test]
    fn extract_python_functions_and_classes() {
        let source = "def foo():\n    pass\n\nclass Bar:\n    pass\n";
        let symbols = parse_and_extract(source, "py");
        assert!(symbols.contains(&"foo".to_string()));
        assert!(symbols.contains(&"Bar".to_string()));
    }

    #[test]
    fn extract_rust_items() {
        let source = "fn helper() {}\nstruct Config {}\nenum Color { Red }\ntrait Render {}\nimpl Config {}";
        let symbols = parse_and_extract(source, "rs");
        assert!(symbols.contains(&"helper".to_string()));
        assert!(symbols.contains(&"Config".to_string()));
        assert!(symbols.contains(&"Color".to_string()));
        assert!(symbols.contains(&"Render".to_string()));
    }

    #[test]
    fn extract_go_functions() {
        let source = "package main\n\nfunc Foo() {}\nfunc bar() {}";
        let symbols = parse_and_extract(source, "go");
        assert!(symbols.contains(&"Foo".to_string()));
        assert!(symbols.contains(&"bar".to_string()));
    }

    // ── collect_symbol_references ──

    fn parse_and_collect_refs(source: &str, ext: &str) -> HashMap<String, HashSet<String>> {
        let lang = get_language(ext).unwrap();
        let mut parser = Parser::new();
        parser.set_language(&lang).unwrap();
        let tree = parser.parse(source.as_bytes(), None).unwrap();
        collect_symbol_references(source.as_bytes(), &tree)
    }

    #[test]
    fn collect_refs_for_ts_function_calling_another() {
        let source = "function helper() { return 1; }\nfunction main() { return helper(); }";
        let refs = parse_and_collect_refs(source, "ts");
        let main_refs = refs.get("main").expect("main should have refs");
        assert!(main_refs.contains("helper"), "main should reference helper");
    }

    #[test]
    fn collect_refs_excludes_self() {
        let source = "function foo() { return foo(); }";
        let refs = parse_and_collect_refs(source, "ts");
        let foo_refs = refs.get("foo").unwrap_or(&HashSet::new()).clone();
        assert!(!foo_refs.contains("foo"), "self-references should be excluded");
    }

    #[test]
    fn collect_refs_for_python_function() {
        let source = "def helper():\n    return 1\n\ndef main():\n    return helper()\n";
        let refs = parse_and_collect_refs(source, "py");
        let main_refs = refs.get("main").expect("main should have refs");
        assert!(main_refs.contains("helper"));
    }

    #[tokio::test]
    async fn analyze_reachability_seeds_from_entry_refs_and_keeps_default_export_graph() {
        let files = vec![
            FileContent {
                path: "/project/src/main.tsx".into(),
                content: "import Root from './App';\ncreateRoot(document.getElementById('root')!).render(<Root />);\n".into(),
                token_count: None,
            },
            FileContent {
                path: "/project/src/App.tsx".into(),
                content: "import LimitIndicator from './components/LimitIndicator';\nconst App = () => <LimitIndicator percent={50} />;\nexport default App;\n".into(),
                token_count: None,
            },
            FileContent {
                path: "/project/src/components/LimitIndicator.tsx".into(),
                content: "const getColorClass = (percent: number): string => {\n  if (percent >= 85) return 'bg-red-500';\n  if (percent >= 60) return 'bg-amber-400';\n  return 'bg-emerald-400';\n};\nconst LimitIndicator = ({ percent }: { percent: number }) => {\n  const clampedPercent = Math.max(0, Math.min(percent, 100));\n  return <div className={getColorClass(clampedPercent)} />;\n};\nexport default LimitIndicator;\n".into(),
                token_count: None,
            },
        ];

        let result = analyze_reachability("/project/src/main.tsx".into(), files)
            .await
            .expect("reachability should succeed");

        let app_reachable = result
            .reachable_symbols
            .get("/project/src/App.tsx")
            .cloned()
            .unwrap_or_default();
        assert!(
            app_reachable.contains(&"App".to_string()),
            "App should be reachable from entry refs"
        );

        let indicator_reachable = result
            .reachable_symbols
            .get("/project/src/components/LimitIndicator.tsx")
            .cloned()
            .unwrap_or_default();
        assert!(
            indicator_reachable.contains(&"LimitIndicator".to_string()),
            "default-exported component should be reachable"
        );
        assert!(
            indicator_reachable.contains(&"getColorClass".to_string()),
            "helper used by reachable component should be reachable"
        );

        let indicator_unreachable = result
            .unreachable_symbols
            .get("/project/src/components/LimitIndicator.tsx")
            .cloned()
            .unwrap_or_default();
        assert!(!indicator_unreachable.contains(&"LimitIndicator".to_string()));
        assert!(!indicator_unreachable.contains(&"getColorClass".to_string()));
    }
}
