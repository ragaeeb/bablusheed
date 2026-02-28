use crate::models::{FileContent, ReachabilityResult};
use std::collections::{HashMap, HashSet, VecDeque};
use tree_sitter::{Node, Parser};

fn get_language(extension: &str) -> Option<tree_sitter::Language> {
    match extension {
        "ts" | "tsx" => Some(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
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
    if matches!(node.kind(), "program" | "source_file" | "translation_unit") {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            extract_symbols_from_node(child, source, depth, symbols);
        }
    }
}

/// Find all identifier references in a node (for call graph building)
fn collect_references(node: Node, source: &[u8], refs: &mut HashSet<String>) {
    if node.kind() == "identifier" || node.kind() == "type_identifier" {
        let name = node_text(node, source);
        if !name.is_empty() && name.chars().next().map(|c| c.is_alphabetic() || c == '_').unwrap_or(false) {
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

    if matches!(node.kind(), "program" | "source_file" | "translation_unit") {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            collect_symbol_references_from_node(child, source, depth, symbol_refs);
        }
    }
}

#[tauri::command]
pub async fn analyze_reachability(
    entry_point: String,
    files: Vec<FileContent>,
) -> Result<ReachabilityResult, String> {
    let mut symbol_map: HashMap<String, String> = HashMap::new(); // symbol -> file_path
    let mut file_symbols: HashMap<String, Vec<String>> = HashMap::new(); // file_path -> symbols
    let mut file_refs: HashMap<String, HashSet<String>> = HashMap::new(); // symbol -> refs

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

    for sym in &entry_symbols {
        reachable.insert(sym.clone());
        queue.push_back(sym.clone());
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
