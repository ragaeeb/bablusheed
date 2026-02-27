use crate::models::FileNode;
use anyhow::Result;
use ignore::WalkBuilder;
use std::path::Path;
use uuid::Uuid;

const BINARY_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "avif", "tiff", "pdf", "doc", "docx",
    "xls", "xlsx", "ppt", "pptx", "zip", "tar", "gz", "bz2", "7z", "rar", "exe", "dll", "so",
    "dylib", "a", "lib", "bin", "wasm", "mp3", "mp4", "wav", "ogg", "flac", "avi", "mov", "mkv",
    "webm", "ttf", "otf", "woff", "woff2", "eot", "class", "pyc", "pyo", "o", "obj",
];

const ALWAYS_EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    "__pycache__",
    ".next",
    ".nuxt",
    "coverage",
    ".turbo",
    ".cache",
];

fn is_binary_by_extension(ext: &str) -> bool {
    BINARY_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

fn is_binary_by_content(path: &Path) -> bool {
    use std::io::Read;
    if let Ok(mut file) = std::fs::File::open(path) {
        let mut buf = [0u8; 8192];
        if let Ok(n) = file.read(&mut buf) {
            return buf[..n].contains(&0u8);
        }
    }
    false
}

fn should_exclude_dir(name: &str) -> bool {
    ALWAYS_EXCLUDED_DIRS.contains(&name)
}

fn build_tree(
    root: &Path,
    dir: &Path,
    respect_gitignore: bool,
) -> Result<Vec<FileNode>> {
    let mut entries: Vec<FileNode> = Vec::new();

    let mut builder = WalkBuilder::new(dir);
    builder
        .max_depth(Some(1))
        .hidden(false)
        .git_ignore(respect_gitignore)
        .git_global(false)
        .git_exclude(false);

    let walker = builder.build();

    let mut dir_entries: Vec<_> = walker
        .filter_map(|e| e.ok())
        .filter(|e| e.path() != dir)
        .collect();

    // Sort: dirs first, then files alphabetically
    dir_entries.sort_by(|a, b| {
        let a_dir = a.path().is_dir();
        let b_dir = b.path().is_dir();
        if a_dir == b_dir {
            a.path().file_name().cmp(&b.path().file_name())
        } else if a_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    for entry in dir_entries {
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let is_dir = path.is_dir();

        // Skip always-excluded directories
        if is_dir && should_exclude_dir(&name) {
            continue;
        }

        // Skip .DS_Store and similar
        if name == ".DS_Store" || name == "Thumbs.db" {
            continue;
        }

        let extension = path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
            .to_string();

        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let metadata = std::fs::metadata(path).ok();
        let size = metadata.map(|m| if is_dir { 0 } else { m.len() }).unwrap_or(0);

        // Skip binary files
        if !is_dir && (is_binary_by_extension(&extension) || is_binary_by_content(path)) {
            continue;
        }

        let id = Uuid::new_v4().to_string();

        let children = if is_dir {
            Some(build_tree(root, path, respect_gitignore)?)
        } else {
            None
        };

        entries.push(FileNode {
            id,
            path: path.to_string_lossy().to_string(),
            relative_path,
            name,
            extension,
            size,
            is_dir,
            children,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn walk_directory(
    path: String,
    respect_gitignore: bool,
    custom_ignore_patterns: Vec<String>,
) -> Result<Vec<FileNode>, String> {
    let root = Path::new(&path);
    if !root.exists() || !root.is_dir() {
        return Err(format!(
            "Path does not exist or is not a directory: {}",
            path
        ));
    }

    // Write custom ignore patterns to a temp file if provided
    let temp_ignore_file = if !custom_ignore_patterns.is_empty() {
        let tmp = std::env::temp_dir().join(".codepacker_ignore");
        if std::fs::write(&tmp, custom_ignore_patterns.join("\n")).is_ok() {
            Some(tmp)
        } else {
            None
        }
    } else {
        None
    };

    let mut nodes = build_tree(root, root, respect_gitignore).map_err(|e| e.to_string())?;

    // Apply custom ignore patterns as post-filter if we couldn't add them to walker
    if let Some(_ignore_file) = temp_ignore_file {
        let patterns: Vec<glob::Pattern> = custom_ignore_patterns
            .iter()
            .filter_map(|p| glob::Pattern::new(p).ok())
            .collect();

        if !patterns.is_empty() {
            fn filter_nodes(nodes: Vec<FileNode>, patterns: &[glob::Pattern]) -> Vec<FileNode> {
                nodes
                    .into_iter()
                    .filter(|n| {
                        !patterns
                            .iter()
                            .any(|p| p.matches(&n.relative_path) || p.matches(&n.name))
                    })
                    .map(|mut n| {
                        if let Some(children) = n.children {
                            n.children = Some(filter_nodes(children, patterns));
                        }
                        n
                    })
                    .collect()
            }
            nodes = filter_nodes(nodes, &patterns);
        }
    }

    Ok(nodes)
}
