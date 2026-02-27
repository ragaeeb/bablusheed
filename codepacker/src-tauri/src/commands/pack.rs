use crate::models::{FileContent, PackItem, PackRequest, PackResponse};

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
        "xml" => {
            format!("<document path=\"{path}\">\n{content}\n</document>")
        }
        _ => {
            // plaintext
            format!("// ===== {path} =====\n{content}")
        }
    }
}

fn wrap_pack(content: &str, format: &str) -> String {
    if format == "xml" {
        format!("<documents>\n{content}\n</documents>")
    } else {
        content.to_string()
    }
}

/// First Fit Decreasing bin-packing algorithm
fn distribute_files(
    files: &[FileContent],
    num_packs: usize,
    token_counts: &[usize],
) -> Vec<Vec<usize>> {
    let n = files.len();
    let num_packs = num_packs.min(n).max(1);

    let total: usize = token_counts.iter().sum();
    let bin_capacity = (total as f64 / num_packs as f64 * 1.1).ceil() as usize;

    // Sort indices by token count descending (FFD)
    let mut sorted_indices: Vec<usize> = (0..n).collect();
    sorted_indices.sort_by(|&a, &b| token_counts[b].cmp(&token_counts[a]));

    let mut bins: Vec<Vec<usize>> = vec![Vec::new(); num_packs];
    let mut bin_sizes: Vec<usize> = vec![0; num_packs];

    for idx in sorted_indices {
        let t = token_counts[idx];
        // Find first bin that fits
        let mut placed = false;
        for b in 0..num_packs {
            if bin_sizes[b] + t <= bin_capacity || bins[b].is_empty() {
                bins[b].push(idx);
                bin_sizes[b] += t;
                placed = true;
                break;
            }
        }
        if !placed {
            // Find bin with most capacity remaining
            let min_b = bin_sizes
                .iter()
                .enumerate()
                .min_by_key(|(_, &s)| s)
                .map(|(i, _)| i)
                .unwrap_or(0);
            bins[min_b].push(idx);
            bin_sizes[min_b] += t;
        }
    }

    // Remove empty bins
    bins.retain(|b| !b.is_empty());

    // Pad to num_packs if needed (shouldn't happen but defensive)
    while bins.len() < num_packs.min(n) {
        bins.push(Vec::new());
    }

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

    // Estimate tokens for each file
    let token_counts: Vec<usize> = files.iter().map(|f| estimate_tokens(&f.content)).collect();
    let total_tokens: usize = token_counts.iter().sum();

    // Distribute files across packs
    let bins = distribute_files(files, num_packs, &token_counts);

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

        let separator = if format == "xml" { "\n" } else { "\n\n" };
        let inner = pack_content_parts.join(separator);
        let content = wrap_pack(&inner, format);

        packs.push(PackItem {
            index: i,
            content,
            estimated_tokens: pack_tokens,
            file_count: bin.len(),
            file_paths,
        });
    }

    Ok(PackResponse {
        packs,
        total_tokens,
    })
}
