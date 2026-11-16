use crate::models::{SearchRequest, SearchResponse};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

pub fn search_files(req: SearchRequest) -> SearchResponse {
    let mut matches = vec![];
    let mut log = vec![];
    let root = Path::new(&req.root_dir);
    if !root.is_dir() {
        return SearchResponse {
            matches,
            log: vec!["Invalid root dir".into()],
        };
    }

    let query = req.query.to_lowercase();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let rel = path.strip_prefix(root).unwrap_or(path);
        let parts: Vec<String> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect();
        if parts[..parts.len().saturating_sub(1)]
            .iter()
            .any(|s| req.excluded_dirs.iter().any(|d| d == s))
        {
            continue;
        }
        if let Ok(content) = fs::read_to_string(path) {
            if content.to_lowercase().contains(&query) {
                matches.push(path.to_string_lossy().to_string());
            }
        }
    }
    log.push(format!("Found {} matches for '{}'", matches.len(), req.query));
    SearchResponse { matches, log }
}