use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub id: String,
    pub path: String,
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PackRequest {
    pub files: Vec<FileContent>,
    #[serde(rename = "numPacks")]
    pub num_packs: usize,
    #[serde(rename = "outputFormat")]
    pub output_format: String,
    #[serde(rename = "llmProfileId")]
    pub llm_profile_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PackItem {
    pub index: usize,
    pub content: String,
    #[serde(rename = "estimatedTokens")]
    pub estimated_tokens: usize,
    #[serde(rename = "fileCount")]
    pub file_count: usize,
    #[serde(rename = "filePaths")]
    pub file_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PackResponse {
    pub packs: Vec<PackItem>,
    #[serde(rename = "totalTokens")]
    pub total_tokens: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReachabilityResult {
    pub reachable_symbols: HashMap<String, Vec<String>>,
    pub unreachable_symbols: HashMap<String, Vec<String>>,
}
