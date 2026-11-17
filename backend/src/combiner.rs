use crate::models::*;
use chrono::Local;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

pub fn combine_files(req: CombineRequest) -> Result<CombineResponse, String> {
    let root = Path::new(&req.root_dir);
    if !root.is_dir() {
        return Err("Root directory not found".into());
    }

    let mut log: Vec<String> = vec![];
    let mut combined: String = String::new();
    let mut processed: Vec<String> = vec![];
    let mut duplicates: Vec<DuplicatePair> = vec![];
    let mut hashes: HashMap<String, String> = HashMap::new();
    let mut total_size: u64 = 0;

    log.push(format!("🚀 Starting from: {}", req.root_dir));
    log.push(format!("🚫 Excluding dirs: {:?}", req.excluded_dirs));

    // Header tree
    let tree = crate::tree::generate_tree(TreeRequest {
        root_dir: req.root_dir.clone(),
        excluded_dirs: req.excluded_dirs.clone(),
        excluded_files: req.excluded_files.clone(),
        included_dirs: req.included_dirs.clone(),
        included_files: req.included_files.clone(),
        use_gitignore: req.use_gitignore,
    });
    let tree_text = if tree.success { tree.tree } else { String::new() };

    combined.push_str(&"=".repeat(80));
    combined.push_str("\n📁 PROJECT STRUCTURE (TREE VIEW)\n");
    combined.push_str(&"=".repeat(80));
    combined.push_str("\n\n");
    combined.push_str(&tree_text);
    combined.push_str("\n\n");
    combined.push_str(&"=".repeat(80));
    combined.push_str("\n📄 FILE CONTENTS\n");
    combined.push_str(&"=".repeat(80));
    combined.push_str(&format!(
        "\nGenerated: {}\nRoot: {}\n",
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        req.root_dir
    ));
    combined.push_str(&"=".repeat(80));
    combined.push_str("\n");

    let use_include = !req.included_dirs.is_empty() || !req.included_files.is_empty();
    let mut files: Vec<(String, String)> = vec![]; // (abs, rel)

    // --- Fast, pruned directory walk ------------------------------------------
    // We use the `ignore` crate's WalkBuilder which lets us prune directories
    // BEFORE descending into them. This is critical: projects with `target/`,
    // `node_modules/`, `.git/` etc. contain tens of thousands of files that we
    // would otherwise walk and then discard.
    use ignore::WalkBuilder;

    // Owned sets — required because `filter_entry` needs a 'static closure.
    let excluded_dirs_set: HashSet<String> =
        req.excluded_dirs.iter().cloned().collect();
    let excluded_files_set: HashSet<String> =
        req.excluded_files.iter().cloned().collect();
    let included_dirs_set: HashSet<String> =
        req.included_dirs.iter().cloned().collect();
    let included_files_set: HashSet<String> =
        req.included_files.iter().cloned().collect();

    // Clone once for the closure (it needs to own its captures).
    let excluded_dirs_for_closure = excluded_dirs_set.clone();
    let excluded_files_for_closure = excluded_files_set.clone();

    let mut builder = WalkBuilder::new(root);
    builder.follow_links(false);
    builder.hidden(false);
    builder.git_ignore(req.use_gitignore);
    builder.git_global(req.use_gitignore);
    builder.git_exclude(req.use_gitignore);
    builder.ignore(false);
    builder.parents(false);

    // Prune excluded dirs/files BEFORE descending into them.
    // Owned sets make this closure 'static-compatible.
    builder.filter_entry(move |entry| {
        let name_os = match entry.file_name().to_str() {
            Some(s) => s,
            None => return false,
        };
        if entry.depth() == 0 {
            return true;
        }
        if excluded_dirs_for_closure.contains(name_os)
            || excluded_files_for_closure.contains(name_os)
        {
            return false;
        }
        true
    });

    for entry in builder.build().filter_map(|e| e.ok()) {
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        let rel = match path.strip_prefix(root) {
            Ok(p) => p.to_string_lossy().to_string().replace('\\', "/"),
            Err(_) => continue,
        };
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        // Secondary exclusion check on the full relative path segments —
        // needed because `filter_entry` only matches the immediate basename
        // and directories can be excluded by name at any depth.
        let parts: Vec<&str> = rel.split('/').collect();
        if parts[..parts.len().saturating_sub(1)]
            .iter()
            .any(|s| excluded_dirs_set.contains(*s))
        {
            continue;
        }
        if excluded_files_set.contains(&name) {
            continue;
        }

        // Include filters
        if use_include {
            if !included_files_set.is_empty() {
                if !included_files_set.contains(&name) {
                    let abs = fs::canonicalize(path)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if !included_files_set.contains(&abs) {
                        continue;
                    }
                }
            } else if !included_dirs_set.is_empty() {
                let dir_parts: Vec<&str> = parts[..parts.len().saturating_sub(1)].to_vec();
                if !dir_parts.iter().any(|s| included_dirs_set.contains(*s)) {
                    continue;
                }
            }
        }

        // Size check — stat once, keep the result
        let size = match path.metadata() {
            Ok(md) => md.len(),
            Err(_) => continue,
        };
        if let Some(max) = req.max_file_size {
            if max > 0 && size > max {
                log.push(format!("⏭️ Skipping large: {} ({} bytes)", rel, size));
                continue;
            }
        }

        files.push((path.to_string_lossy().to_string(), rel));
    }

    if req.sort_files {
        files.sort_by(|a, b| a.1.cmp(&b.1));
    }

    for (abs, rel) in &files {
        // Read content once
        let content = match fs::read_to_string(abs) {
            Ok(c) => c,
            Err(_) => {
                log.push(format!("⚠️ Skipping binary: {}", rel));
                continue;
            }
        };

        // Stat once, use for both size check and stats header
        let (size, modified_str) = match fs::metadata(abs) {
            Ok(md) => {
                let modified = md
                    .modified()
                    .ok()
                    .and_then(|t| {
                        let dt: chrono::DateTime<Local> = t.into();
                        Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    })
                    .unwrap_or_default();
                (md.len(), modified)
            }
            Err(_) => (content.len() as u64, String::new()),
        };

        // Hash only after we've committed to this file
        let hash = md5_hash(&content);
        if let Some(orig) = hashes.get(&hash) {
            duplicates.push(DuplicatePair {
                file: rel.clone(),
                original: orig.clone(),
            });
        }
        hashes.insert(hash, rel.clone());
        total_size += size;

        combined.push_str(&format!("\n--- START FILE: {} ---\n", rel));
        if req.include_stats {
            let lines = content.lines().count();
            combined.push_str(&format!(
                "# Size: {} bytes | Lines: {} | Modified: {}\n\n",
                size, lines, modified_str
            ));
        } else {
            combined.push_str("\n");
        }
        combined.push_str(&content);
        combined.push_str(&format!("\n--- END FILE: {} ---\n", rel));
        processed.push(rel.clone());
        log.push(format!("✅ Included: {}", rel));
    }

    // Summary
    combined.push_str("\n");
    combined.push_str(&"=".repeat(80));
    combined.push_str("\n📊 SUMMARY\n");
    combined.push_str(&"=".repeat(80));
    combined.push_str(&format!(
        "\nTotal files: {}\nTotal size: {} bytes\n",
        processed.len(),
        total_size
    ));
    if !duplicates.is_empty() {
        combined.push_str("\n⚠️ DUPLICATE FILES DETECTED:\n");
        for d in &duplicates {
            combined.push_str(&format!("  - {} (duplicate of {})\n", d.file, d.original));
        }
    }
    combined.push_str(&"=".repeat(80));
    combined.push_str("\n");

    // Ensure the parent directory exists
    if let Some(parent) = Path::new(&req.output_path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Could not create output directory '{}': {}",
                    parent.display(),
                    e
                )
            })?;
        }
    }

    fs::write(&req.output_path, combined).map_err(|e| {
        format!(
            "Write error at '{}': {}. The path may be a folder, missing a filename, or not writable.",
            req.output_path, e
        )
    })?;
    log.push(format!(
        "✅ Successfully combined {} files to: {}",
        processed.len(),
        req.output_path
    ));

    Ok(CombineResponse {
        success: true,
        output_path: req.output_path,
        content: None,
        files_processed: processed.len(),
        total_size,
        duplicates,
        log,
    })
}

pub fn combine_uploaded_files(req: CombineRequest, uploaded_files: Vec<(String, String)>) -> Result<CombineResponse, String> {
    let mut log: Vec<String> = vec![];
    let mut combined: String = String::new();
    let mut processed: Vec<String> = vec![];
    let mut duplicates: Vec<DuplicatePair> = vec![];
    let mut hashes: HashMap<String, String> = HashMap::new();
    let mut total_size: u64 = 0;

    log.push("🚀 Processing uploaded files...".to_string());

    let excluded_dirs: HashSet<String> = req.excluded_dirs.iter().cloned().collect();
    let excluded_files: HashSet<String> = req.excluded_files.iter().cloned().collect();
    let included_dirs: HashSet<String> = req.included_dirs.iter().cloned().collect();
    let included_files: HashSet<String> = req.included_files.iter().cloned().collect();
    let use_include = !included_dirs.is_empty() || !included_files.is_empty();

    let mut files = vec![];

    for (rel, content) in uploaded_files {
        let parts: Vec<&str> = rel.split('/').collect();
        let name = parts.last().unwrap_or(&"").to_string();

        // Exclude checks
        if parts.iter().any(|s| excluded_dirs.contains(*s)) {
            continue;
        }
        if excluded_files.contains(&name) {
            continue;
        }

        // Include filters
        if use_include {
            let mut included = false;
            if !included_files.is_empty() {
                if included_files.contains(&name) || included_files.contains(&rel) {
                    included = true;
                }
            } else if !included_dirs.is_empty() {
                let dir_parts: Vec<&str> = parts[..parts.len().saturating_sub(1)].to_vec();
                if dir_parts.iter().any(|s| included_dirs.contains(*s)) {
                    included = true;
                }
            }
            if !included {
                continue;
            }
        }

        // Size check
        let size = content.len() as u64;
        if let Some(max) = req.max_file_size {
            if max > 0 && size > max {
                log.push(format!("⏭️ Skipping large: {} ({} bytes)", rel, size));
                continue;
            }
        }

        files.push((rel, content, size));
    }

    if req.sort_files {
        files.sort_by(|a, b| a.0.cmp(&b.0));
    }

    // Build combined text
    let bar = "=".repeat(80);
    combined.push_str(&bar);
    combined.push_str("\n📁 PROJECT STRUCTURE (TREE VIEW)\n");
    combined.push_str(&bar);
    combined.push_str("\n\n");
    
    // Simple tree view for uploads
    let mut tree_paths = HashSet::new();
    for (rel, _, _) in &files {
        let parts: Vec<&str> = rel.split('/').collect();
        for i in 1..=parts.len() {
            tree_paths.insert(parts[..i].join("/"));
        }
    }
    let mut sorted_tree: Vec<_> = tree_paths.into_iter().collect();
    sorted_tree.sort();
    
    let file_set: HashSet<_> = files.iter().map(|f| &f.0).collect();
    for p in sorted_tree {
        let depth = p.split('/').count() - 1;
        let name = p.split('/').last().unwrap_or("");
        let icon = if file_set.contains(&p) { "📄" } else { "📁" };
        combined.push_str(&format!("{}{} {}\n", "  ".repeat(depth), icon, name));
    }

    combined.push_str("\n");
    combined.push_str(&bar);
    combined.push_str("\n📄 FILE CONTENTS\n");
    combined.push_str(&bar);
    combined.push_str(&format!(
        "\nGenerated: {}\nRoot: (uploaded)\n",
        Local::now().format("%Y-%m-%d %H:%M:%S")
    ));
    combined.push_str(&bar);
    combined.push_str("\n");

    for (rel, content, size) in files {
        let hash = md5_hash(&content);
        if let Some(orig) = hashes.get(&hash) {
            duplicates.push(DuplicatePair {
                file: rel.clone(),
                original: orig.clone(),
            });
        }
        hashes.insert(hash, rel.clone());
        total_size += size;

        combined.push_str(&format!("\n--- START FILE: {} ---\n", rel));
        if req.include_stats {
            let lines = content.lines().count();
            combined.push_str(&format!(
                "# Size: {} bytes | Lines: {} | Modified: (uploaded)\n\n",
                size, lines
            ));
        } else {
            combined.push_str("\n");
        }
        combined.push_str(&content);
        combined.push_str(&format!("\n--- END FILE: {} ---\n", rel));
        processed.push(rel.clone());
        log.push(format!("✅ Included: {}", rel));
    }

    // Summary
    combined.push_str("\n");
    combined.push_str(&bar);
    combined.push_str("\n📊 SUMMARY\n");
    combined.push_str(&bar);
    combined.push_str(&format!(
        "\nTotal files: {}\nTotal size: {} bytes\n",
        processed.len(),
        total_size
    ));
    if !duplicates.is_empty() {
        combined.push_str("\n⚠️ DUPLICATE FILES DETECTED:\n");
        for d in &duplicates {
            combined.push_str(&format!("  - {} (duplicate of {})\n", d.file, d.original));
        }
    }
    combined.push_str(&bar);
    combined.push_str("\n");

    Ok(CombineResponse {
        success: true,
        output_path: "combined_project_files.txt".to_string(),
        content: Some(combined),
        files_processed: processed.len(),
        total_size,
        duplicates,
        log,
    })
}

fn md5_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    format!("{:x}", h.finish())
}