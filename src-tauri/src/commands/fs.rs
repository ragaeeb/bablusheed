use crate::models::FileNode;
use anyhow::Result;
use ignore::WalkBuilder;
use std::path::{Component, Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use tauri::async_runtime;
use tokio::fs as tokio_fs;
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

#[derive(Default)]
struct FsScopeState {
    project_roots: Vec<PathBuf>,
    export_roots: Vec<PathBuf>,
}

static FS_SCOPE_STATE: LazyLock<Mutex<FsScopeState>> =
    LazyLock::new(|| Mutex::new(FsScopeState::default()));

fn path_has_parent_traversal(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    std::fs::canonicalize(path).map_err(|e| e.to_string())
}

fn canonicalize_for_write(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return canonicalize_existing_path(path);
    }

    let mut probe = path;
    while !probe.exists() {
        probe = probe
            .parent()
            .ok_or_else(|| format!("Path has no existing parent: {}", path.display()))?;
    }

    let canonical_existing = canonicalize_existing_path(probe)?;
    let relative_suffix = path
        .strip_prefix(probe)
        .map_err(|e| format!("Failed to resolve target path: {e}"))?;

    Ok(canonical_existing.join(relative_suffix))
}

fn remember_project_root(root: PathBuf) {
    if let Ok(mut state) = FS_SCOPE_STATE.lock() {
        if !state.project_roots.iter().any(|existing| existing == &root) {
            state.project_roots.push(root);
        }
    }
}

fn remember_export_root(root: PathBuf) {
    if let Ok(mut state) = FS_SCOPE_STATE.lock() {
        if !state.export_roots.iter().any(|existing| existing == &root) {
            state.export_roots.push(root);
        }
    }
}

fn is_path_allowed(target: &Path) -> bool {
    if let Ok(state) = FS_SCOPE_STATE.lock() {
        state
            .project_roots
            .iter()
            .chain(state.export_roots.iter())
            .any(|root| target.starts_with(root))
    } else {
        false
    }
}

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

    let mut nodes = build_tree(root, root, respect_gitignore).map_err(|e| e.to_string())?;
    if let Ok(canonical_root) = canonicalize_existing_path(root) {
        remember_project_root(canonical_root);
    }

    if !custom_ignore_patterns.is_empty() {
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

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if path_has_parent_traversal(&file_path) {
        return Err(format!("Parent traversal is not allowed: {path}"));
    }
    let metadata = tokio_fs::metadata(&file_path).await.map_err(|_| {
        format!("Path does not exist or is not a file: {}", path)
    })?;
    if !metadata.is_file() {
        return Err(format!("Path does not exist or is not a file: {}", path));
    }

    let canonical_path = tokio_fs::canonicalize(&file_path)
        .await
        .map_err(|e| e.to_string())?;
    if !is_path_allowed(&canonical_path) {
        return Err(format!("Read path is outside allowed roots: {}", path));
    }

    let bytes = tokio_fs::read(&canonical_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub async fn authorize_export_directory(path: String) -> Result<(), String> {
    let dir_path = PathBuf::from(&path);
    if path_has_parent_traversal(&dir_path) {
        return Err(format!("Parent traversal is not allowed: {path}"));
    }
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Export directory does not exist or is not a directory: {}", path));
    }
    let canonical = canonicalize_existing_path(&dir_path)?;
    remember_export_root(canonical);
    Ok(())
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if path_has_parent_traversal(&file_path) {
        return Err(format!("Parent traversal is not allowed: {path}"));
    }

    if let Ok(metadata) = std::fs::metadata(&file_path) {
        if metadata.is_dir() {
            return Err(format!("Path is a directory: {}", path));
        }
    }

    let canonical_target = canonicalize_for_write(&file_path)?;
    if !is_path_allowed(&canonical_target) {
        return Err(format!("Write path is outside allowed roots: {}", path));
    }

    let write_path = canonical_target.clone();
    async_runtime::spawn_blocking(move || -> Result<(), String> {
        if let Some(parent) = write_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&write_path, content).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // ── path_has_parent_traversal ──

    #[test]
    fn detects_parent_traversal() {
        assert!(path_has_parent_traversal(Path::new("../secret")));
        assert!(path_has_parent_traversal(Path::new("foo/../../etc/passwd")));
        assert!(path_has_parent_traversal(Path::new("a/b/../c")));
    }

    #[test]
    fn allows_normal_paths() {
        assert!(!path_has_parent_traversal(Path::new("foo/bar/baz")));
        assert!(!path_has_parent_traversal(Path::new("/absolute/path")));
        assert!(!path_has_parent_traversal(Path::new("./relative")));
        assert!(!path_has_parent_traversal(Path::new("file.txt")));
    }

    // ── is_binary_by_extension ──

    #[test]
    fn recognizes_binary_extensions() {
        let binary_exts = ["png", "jpg", "jpeg", "gif", "pdf", "zip", "exe", "wasm", "mp3", "mp4", "ttf", "woff2"];
        for ext in binary_exts {
            assert!(is_binary_by_extension(ext), "expected {} to be binary", ext);
        }
    }

    #[test]
    fn allows_text_extensions() {
        let text_exts = ["ts", "rs", "py", "go", "md", "json", "txt", "html", "css"];
        for ext in text_exts {
            assert!(!is_binary_by_extension(ext), "expected {} to be text", ext);
        }
    }

    #[test]
    fn binary_detection_is_case_insensitive() {
        assert!(is_binary_by_extension("PNG"));
        assert!(is_binary_by_extension("Jpg"));
        assert!(is_binary_by_extension("WASM"));
    }

    // ── should_exclude_dir ──

    #[test]
    fn excludes_known_dirs() {
        let excluded = ["node_modules", ".git", "dist", "build", "target", "__pycache__", ".next", ".nuxt", "coverage", ".turbo", ".cache"];
        for dir in excluded {
            assert!(should_exclude_dir(dir), "expected {} to be excluded", dir);
        }
    }

    #[test]
    fn allows_normal_dirs() {
        assert!(!should_exclude_dir("src"));
        assert!(!should_exclude_dir("lib"));
        assert!(!should_exclude_dir("components"));
        assert!(!should_exclude_dir("tests"));
    }

    // ── canonicalize_for_write ──

    #[test]
    fn canonicalize_for_write_existing_file() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let result = canonicalize_for_write(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn canonicalize_for_write_new_file_in_existing_dir() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("nonexistent_test_file.txt");
        let result = canonicalize_for_write(&path);
        assert!(result.is_ok());
        let canonical = result.unwrap();
        assert!(canonical.to_string_lossy().contains("nonexistent_test_file.txt"));
    }
}
