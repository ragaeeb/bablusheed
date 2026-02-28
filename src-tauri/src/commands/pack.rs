use crate::models::{FileContent, PackItem, PackRequest, PackResponse};
use std::collections::{BTreeSet, HashMap, HashSet};

/// Estimate tokens using a simple approximation (1 token ≈ 4 characters)
fn estimate_tokens(content: &str) -> usize {
    (content.len() / 4).max(1)
}

fn format_file_header(path: &str, content: &str, format: &str) -> String {
    match format {
        "markdown" => {
            let ext = std::path::Path::new(path)
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let lang = match ext.as_str() {
                "ts" | "tsx" => "typescript",
                "js" | "jsx" => "javascript",
                "rs" => "rust",
                "py" => "python",
                "go" => "go",
                "md" => "markdown",
                "json" => "json",
                "css" => "css",
                "html" => "html",
                "toml" => "toml",
                "yaml" | "yml" => "yaml",
                "sh" | "bash" => "bash",
                _ => "text",
            };
            format!("```{lang}\n// {path}\n{content}\n```")
        }
        _ => {
            // plaintext
            format!("// {path}\n{content}")
        }
    }
}

fn wrap_pack(content: &str) -> String {
    content.to_string()
}

fn normalize_path(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    let replaced = path.replace('\\', "/");

    for part in replaced.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                let _ = parts.pop();
            }
            _ => parts.push(part),
        }
    }

    parts.join("/")
}

fn parent_dir(path: &str) -> &str {
    match path.rfind('/') {
        Some(idx) => &path[..idx],
        None => "",
    }
}

fn has_extension(path: &str) -> bool {
    std::path::Path::new(path).extension().is_some()
}

fn path_extension(path: &str) -> String {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn file_basename(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_ascii_lowercase()
}

fn is_doc_file(path: &str) -> bool {
    let ext = path_extension(path);
    matches!(ext.as_str(), "md" | "mdx" | "txt" | "rst" | "adoc")
}

fn doc_priority(path: &str) -> (u8, String) {
    let normalized = normalize_path(path).to_ascii_lowercase();
    let basename = file_basename(path);

    let bucket = if basename.starts_with("readme") {
        0
    } else if basename.starts_with("overview")
        || basename.starts_with("architecture")
        || basename.starts_with("design")
        || basename.starts_with("spec")
        || basename.starts_with("contributing")
    {
        1
    } else if normalized.starts_with("docs/") || normalized.contains("/docs/") {
        2
    } else {
        3
    };

    (bucket, normalized)
}

fn extract_quoted_segments(line: &str) -> Vec<String> {
    let bytes = line.as_bytes();
    let mut i = 0;
    let mut out = Vec::new();

    while i < bytes.len() {
        let ch = bytes[i];
        if ch != b'\'' && ch != b'"' {
            i += 1;
            continue;
        }

        let quote = ch;
        i += 1;
        let start = i;

        while i < bytes.len() {
            if bytes[i] == b'\\' {
                i = (i + 2).min(bytes.len());
                continue;
            }
            if bytes[i] == quote {
                break;
            }
            i += 1;
        }

        if i <= bytes.len() {
            out.push(String::from_utf8_lossy(&bytes[start..i]).to_string());
        }

        i += 1;
    }

    out
}

fn extract_module_specifiers(content: &str) -> Vec<String> {
    let mut specifiers: HashSet<String> = HashSet::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty()
            || line.starts_with("//")
            || line.starts_with("#")
            || line.starts_with('*')
        {
            continue;
        }

        // JS/TS/Rust/Go style quoted imports: import/export/from/require/import()
        if line.starts_with("import ")
            || line.starts_with("export ")
            || line.contains(" from ")
            || line.contains("require(")
            || line.contains("import(")
            || line.starts_with("use ")
        {
            for q in extract_quoted_segments(line) {
                if !q.is_empty() {
                    specifiers.insert(q);
                }
            }
        }

        // Python: from foo.bar import baz
        if let Some(rest) = line.strip_prefix("from ") {
            if let Some((module, _)) = rest.split_once(" import ") {
                let module = module.trim().replace('.', "/");
                if !module.is_empty() {
                    specifiers.insert(module);
                }
            }
        }

        // Python: import foo.bar, baz
        if let Some(rest) = line.strip_prefix("import ") {
            if !rest.contains('"') && !rest.contains('\'') && !rest.contains(" from ") {
                for item in rest.split(',') {
                    let module = item
                        .trim()
                        .split_whitespace()
                        .next()
                        .unwrap_or("")
                        .replace('.', "/");
                    if !module.is_empty() {
                        specifiers.insert(module);
                    }
                }
            }
        }

        // Rust: mod foo; / pub mod foo;
        if let Some(rest) = line.strip_prefix("mod ").or_else(|| line.strip_prefix("pub mod ")) {
            let module = rest.trim_end_matches(';').trim();
            if !module.is_empty() {
                specifiers.insert(format!("./{module}"));
            }
        }
    }

    specifiers.into_iter().collect()
}

fn resolve_module_specifier(
    specifier: &str,
    current_path: &str,
    path_to_idx: &HashMap<String, usize>,
) -> Option<usize> {
    if specifier.is_empty()
        || specifier.starts_with("http://")
        || specifier.starts_with("https://")
        || specifier.starts_with("node:")
    {
        return None;
    }

    const EXTENSIONS: [&str; 10] = ["ts", "tsx", "js", "jsx", "py", "rs", "go", "json", "md", "mdx"];

    let mut base_candidates: Vec<String> = Vec::new();

    if let Some(rest) = specifier.strip_prefix("@/") {
        base_candidates.push(normalize_path(&format!("src/{rest}")));
    }

    if specifier.starts_with("./") || specifier.starts_with("../") {
        let dir = parent_dir(current_path);
        base_candidates.push(normalize_path(&format!("{dir}/{specifier}")));
    } else if let Some(rest) = specifier.strip_prefix('/') {
        base_candidates.push(normalize_path(rest));
    } else {
        base_candidates.push(normalize_path(specifier));
    }

    let mut expanded: Vec<String> = Vec::new();
    for base in base_candidates {
        if base.is_empty() {
            continue;
        }

        if has_extension(&base) {
            expanded.push(base);
            continue;
        }

        expanded.push(base.clone());
        for ext in EXTENSIONS {
            expanded.push(format!("{base}.{ext}"));
            expanded.push(format!("{base}/index.{ext}"));
        }
    }

    for candidate in expanded {
        if let Some(idx) = path_to_idx.get(&candidate) {
            return Some(*idx);
        }
    }

    None
}

fn build_dependency_graph(files: &[FileContent]) -> (Vec<String>, Vec<HashSet<usize>>, Vec<usize>) {
    let n = files.len();
    let normalized_paths: Vec<String> = files.iter().map(|f| normalize_path(&f.path)).collect();

    let mut path_to_idx: HashMap<String, usize> = HashMap::new();
    for (idx, path) in normalized_paths.iter().enumerate() {
        path_to_idx.insert(path.clone(), idx);
    }

    // dependency -> dependents
    let mut edges: Vec<HashSet<usize>> = vec![HashSet::new(); n];
    let mut indegree: Vec<usize> = vec![0; n];

    for (idx, file) in files.iter().enumerate() {
        let current_path = &normalized_paths[idx];
        for spec in extract_module_specifiers(&file.content) {
            if let Some(dep_idx) = resolve_module_specifier(&spec, current_path, &path_to_idx) {
                if dep_idx != idx && edges[dep_idx].insert(idx) {
                    indegree[idx] += 1;
                }
            }
        }
    }

    (normalized_paths, edges, indegree)
}

/// Build a best-effort dependency-first order:
/// if A imports B, B is placed before A when possible.
fn compute_dependency_order(files: &[FileContent]) -> Vec<usize> {
    let n = files.len();
    if n <= 1 {
        return (0..n).collect();
    }

    let (normalized_paths, edges, mut indegree) = build_dependency_graph(files);

    let mut ready: BTreeSet<(String, usize)> = BTreeSet::new();
    for idx in 0..n {
        if indegree[idx] == 0 {
            ready.insert((normalized_paths[idx].clone(), idx));
        }
    }

    let mut order: Vec<usize> = Vec::with_capacity(n);
    let mut in_order = vec![false; n];

    while let Some((_, idx)) = ready.pop_first() {
        order.push(idx);
        in_order[idx] = true;

        let mut dependents: Vec<usize> = edges[idx].iter().copied().collect();
        dependents.sort_by(|a, b| normalized_paths[*a].cmp(&normalized_paths[*b]));

        for dependent in dependents {
            indegree[dependent] = indegree[dependent].saturating_sub(1);
            if indegree[dependent] == 0 {
                ready.insert((normalized_paths[dependent].clone(), dependent));
            }
        }
    }

    // Cycles fallback: append remaining files in stable path order.
    if order.len() < n {
        let mut remaining: Vec<usize> = (0..n).filter(|idx| !in_order[*idx]).collect();
        remaining.sort_by(|a, b| normalized_paths[*a].cmp(&normalized_paths[*b]));
        order.extend(remaining);
    }

    order
}

/// Build undirected file adjacency graph from imports for related-file grouping.
fn build_related_adjacency(files: &[FileContent]) -> Vec<HashSet<usize>> {
    let n = files.len();
    let normalized_paths: Vec<String> = files.iter().map(|f| normalize_path(&f.path)).collect();

    let mut path_to_idx: HashMap<String, usize> = HashMap::new();
    for (idx, path) in normalized_paths.iter().enumerate() {
        path_to_idx.insert(path.clone(), idx);
    }

    let mut adjacency: Vec<HashSet<usize>> = vec![HashSet::new(); n];

    for (idx, file) in files.iter().enumerate() {
        let current_path = &normalized_paths[idx];
        for spec in extract_module_specifiers(&file.content) {
            if let Some(dep_idx) = resolve_module_specifier(&spec, current_path, &path_to_idx) {
                if dep_idx != idx {
                    adjacency[idx].insert(dep_idx);
                    adjacency[dep_idx].insert(idx);
                }
            }
        }
    }

    adjacency
}

/// Group code files by import-connected components and keep dependency order inside each group.
fn group_code_by_related_components(code_order: &[usize], related: &[HashSet<usize>]) -> Vec<usize> {
    if code_order.len() <= 1 {
        return code_order.to_vec();
    }

    let allowed: HashSet<usize> = code_order.iter().copied().collect();
    let mut position: HashMap<usize, usize> = HashMap::new();
    for (pos, idx) in code_order.iter().enumerate() {
        position.insert(*idx, pos);
    }

    let mut visited: HashSet<usize> = HashSet::new();
    let mut grouped: Vec<usize> = Vec::with_capacity(code_order.len());

    for &start in code_order {
        if visited.contains(&start) {
            continue;
        }

        let mut stack = vec![start];
        visited.insert(start);
        let mut component = vec![start];

        while let Some(node) = stack.pop() {
            for &neighbor in &related[node] {
                if !allowed.contains(&neighbor) || visited.contains(&neighbor) {
                    continue;
                }
                visited.insert(neighbor);
                stack.push(neighbor);
                component.push(neighbor);
            }
        }

        component.sort_by_key(|idx| *position.get(idx).unwrap_or(&usize::MAX));
        grouped.extend(component);
    }

    grouped
}

fn split_docs_and_code(ordered_indices: &[usize], files: &[FileContent]) -> (Vec<usize>, Vec<usize>) {
    let mut docs = Vec::new();
    let mut code = Vec::new();

    for &idx in ordered_indices {
        if is_doc_file(&files[idx].path) {
            docs.push(idx);
        } else {
            code.push(idx);
        }
    }

    docs.sort_by_key(|idx| doc_priority(&files[*idx].path));
    (docs, code)
}

/// Preserve relative order and split into near-equal token packs.
fn distribute_files(ordered_indices: &[usize], num_packs: usize, token_counts: &[usize]) -> Vec<Vec<usize>> {
    let n = ordered_indices.len();
    if n == 0 {
        return Vec::new();
    }

    let pack_count = num_packs.min(n).max(1);
    if pack_count == 1 {
        return vec![ordered_indices.to_vec()];
    }

    let total_tokens: usize = ordered_indices.iter().map(|idx| token_counts[*idx]).sum();
    let mut bins: Vec<Vec<usize>> = vec![Vec::new(); pack_count];
    let mut cumulative_tokens = 0usize;
    let mut current_bin = 0usize;

    for (position, idx) in ordered_indices.iter().enumerate() {
        bins[current_bin].push(*idx);
        cumulative_tokens += token_counts[*idx];

        if current_bin >= pack_count - 1 {
            continue;
        }

        let boundary = (total_tokens * (current_bin + 1) + pack_count - 1) / pack_count;
        let remaining_files = n - position - 1;
        let remaining_bins = pack_count - current_bin - 1;

        if cumulative_tokens >= boundary && remaining_files >= remaining_bins {
            current_bin += 1;
        }
    }

    bins.retain(|bin| !bin.is_empty());
    bins
}

fn distribute_with_doc_strategy(
    docs: &[usize],
    code: &[usize],
    num_packs: usize,
    token_counts: &[usize],
) -> Vec<Vec<usize>> {
    if docs.is_empty() || code.is_empty() || num_packs <= 1 {
        let mut merged = Vec::with_capacity(docs.len() + code.len());
        merged.extend_from_slice(docs);
        merged.extend_from_slice(code);
        return distribute_files(&merged, num_packs, token_counts);
    }

    let total_tokens: usize = docs
        .iter()
        .chain(code.iter())
        .map(|idx| token_counts[*idx])
        .sum();
    let docs_tokens: usize = docs.iter().map(|idx| token_counts[*idx]).sum();

    if total_tokens == 0 {
        let mut merged = Vec::with_capacity(docs.len() + code.len());
        merged.extend_from_slice(docs);
        merged.extend_from_slice(code);
        return distribute_files(&merged, num_packs, token_counts);
    }

    // Allocate at least one docs pack and one code pack; use proportional split for context balance.
    let mut docs_pack_count = ((docs_tokens * num_packs) + (total_tokens / 2)) / total_tokens;
    docs_pack_count = docs_pack_count.clamp(1, num_packs - 1);

    let code_pack_count = num_packs - docs_pack_count;
    let mut bins = distribute_files(docs, docs_pack_count, token_counts);
    bins.extend(distribute_files(code, code_pack_count, token_counts));
    bins
}

#[tauri::command]
pub async fn pack_files(request: PackRequest) -> Result<PackResponse, String> {
    let files = &request.files;
    if files.is_empty() {
        return Ok(PackResponse {
            packs: Vec::new(),
            total_tokens: 0,
        });
    }

    let num_packs = request.num_packs.max(1);
    let format = request.output_format.as_str();

    // Use pre-computed token counts from frontend when available, fall back to estimate.
    let token_counts: Vec<usize> = files
        .iter()
        .map(|f| f.token_count.unwrap_or_else(|| estimate_tokens(&f.content)))
        .collect();
    let total_tokens: usize = token_counts.iter().sum();

    // 1) Dependency-aware ordering for code comprehension.
    let dependency_order = compute_dependency_order(files);

    // 2) Split docs from code and place docs first (README/architecture docs prioritized).
    let (docs_order, code_order_initial) = split_docs_and_code(&dependency_order, files);

    // 3) Group related code files via import-connected components, preserving dependency order inside groups.
    let related_graph = build_related_adjacency(files);
    let code_order = group_code_by_related_components(&code_order_initial, &related_graph);

    // 4) Keep docs and code in separate pack regions when possible to reduce context switching.
    let bins = distribute_with_doc_strategy(&docs_order, &code_order, num_packs, &token_counts);

    let mut packs = Vec::new();
    for (i, bin) in bins.iter().enumerate() {
        if bin.is_empty() {
            continue;
        }

        let mut pack_content_parts = Vec::new();
        let mut pack_tokens = 0;
        let mut file_paths = Vec::new();

        for &file_idx in bin {
            let file = &files[file_idx];
            let formatted = format_file_header(&file.path, &file.content, format);
            pack_tokens += token_counts[file_idx];
            file_paths.push(file.path.clone());
            pack_content_parts.push(formatted);
        }

        let separator = "\n\n";
        let inner = pack_content_parts.join(separator);
        let content = wrap_pack(&inner);

        packs.push(PackItem {
            index: i,
            content,
            estimated_tokens: pack_tokens,
            file_count: bin.len(),
            file_paths,
        });
    }

    Ok(PackResponse { packs, total_tokens })
}
