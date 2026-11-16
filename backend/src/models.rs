use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct BrowseRequest {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,   // absolute path — lets the frontend navigate without guessing
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
pub struct BrowseResponse {
    pub success: bool,
    pub error: Option<String>,
    pub entries: Vec<FileEntry>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CombineRequest {
    pub root_dir: String,
    pub output_path: String,
    pub excluded_dirs: Vec<String>,
    pub excluded_files: Vec<String>,
    pub included_dirs: Vec<String>,
    pub included_files: Vec<String>,
    pub max_file_size: Option<u64>,
    pub include_stats: bool,
    pub sort_files: bool,
    pub use_gitignore: bool,
}

#[derive(Debug, Serialize)]
pub struct DuplicatePair {
    pub file: String,
    pub original: String,
}

#[derive(Debug, Serialize)]
pub struct CombineResponse {
    pub success: bool,
    pub output_path: String,
    pub files_processed: usize,
    pub total_size: u64,
    pub duplicates: Vec<DuplicatePair>,
    pub log: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub root_dir: String,
    pub query: String,
    pub excluded_dirs: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub matches: Vec<String>,
    pub log: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct TreeRequest {
    pub root_dir: String,
    pub excluded_dirs: Vec<String>,
    pub excluded_files: Vec<String>,
    pub included_dirs: Vec<String>,
    pub included_files: Vec<String>,
    #[allow(dead_code)]
    pub use_gitignore: bool,
}

#[derive(Debug, Serialize)]
pub struct TreeResponse {
    pub success: bool,
    pub tree: String,
    pub error: Option<String>,
}