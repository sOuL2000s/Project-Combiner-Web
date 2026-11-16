use crate::models::{TreeRequest, TreeResponse};
use std::path::{Path, PathBuf};

pub fn generate_tree(req: TreeRequest) -> TreeResponse {
    let root = PathBuf::from(&req.root_dir);
    if !root.exists() || !root.is_dir() {
        return TreeResponse {
            success: false,
            tree: String::new(),
            error: Some("Root directory not found".into()),
        };
    }

    // Build a .gitignore matcher when the toggle is on and a .gitignore exists.
    // This keeps the tree header consistent with combiner.rs, which already
    // respects gitignore via WalkBuilder.
    let gitignore: Option<ignore::gitignore::Gitignore> = if req.use_gitignore {
        let gi_path = root.join(".gitignore");
        if gi_path.exists() {
            let mut builder = ignore::gitignore::GitignoreBuilder::new(&root);
            // add() returns Option<Error>; ignore the result — build() will
            // surface any real parse errors.
            let _ = builder.add(&gi_path);
            builder.build().ok()
        } else {
            None
        }
    } else {
        None
    };

    let use_include = !req.included_dirs.is_empty() || !req.included_files.is_empty();
    let mut lines: Vec<String> = vec![format!(
        "{}/",
        root.file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| req.root_dir.clone())
    )];

    walk_dir(
        &root,
        &root,
        "",
        &req,
        use_include,
        &mut lines,
        gitignore.as_ref(),
    );

    TreeResponse {
        success: true,
        tree: lines.join("\n"),
        error: None,
    }
}

fn should_include(
    path: &Path,
    root: &Path,
    req: &TreeRequest,
    is_dir: bool,
    gitignore: Option<&ignore::gitignore::Gitignore>,
) -> bool {
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    // Respect .gitignore — mirrors Python's gitignore_spec.match_file().
    if let Some(gi) = gitignore {
        let rel = path.strip_prefix(root).unwrap_or(path);
        if gi.matched(rel, is_dir).is_ignore() {
            return false;
        }
    }

    if req.excluded_dirs.iter().any(|d| d == &name) && is_dir {
        return false;
    }
    if req.excluded_files.iter().any(|f| f == &name) && !is_dir {
        return false;
    }

    let use_include = !req.included_dirs.is_empty() || !req.included_files.is_empty();
    if use_include {
        let rel = path.strip_prefix(root).unwrap_or(path);
        let segments: Vec<String> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect();

        if !req.included_files.is_empty() && !is_dir {
            if !req.included_files.iter().any(|f| f == &name) {
                return false;
            }
        } else if !req.included_dirs.is_empty() {
            if !segments.iter().any(|s| req.included_dirs.contains(s))
                && !is_dir
            {
                return false;
            }
        }
    }
    true
}

fn walk_dir(
    current: &Path,
    root: &Path,
    prefix: &str,
    req: &TreeRequest,
    use_include: bool,
    lines: &mut Vec<String>,
    gitignore: Option<&ignore::gitignore::Gitignore>,
) {
    let mut items: Vec<PathBuf> = Vec::new();
    if let Ok(read) = std::fs::read_dir(current) {
        for entry in read.flatten() {
            let p = entry.path();
            if p.is_symlink() {
                continue;
            }
            let is_dir = p.is_dir();

            let name = p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            // PRUNE FIRST: if the name matches an excluded dir, never recurse.
            if is_dir && req.excluded_dirs.iter().any(|d| d == &name) {
                continue;
            }

            if !should_include(&p, root, req, is_dir, gitignore) {
                continue;
            }
            if is_dir && use_include {
                // Include dirs ancestors
                let rel = p.strip_prefix(root).unwrap_or(&p);
                let segs: Vec<String> = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                    .collect();
                if !req.included_dirs.is_empty()
                    && !segs.iter().any(|s| req.included_dirs.contains(s))
                {
                    // Still descend in case deeper include exists — but do the
                    // descent via a throwaway writer so this directory is not
                    // rendered; it only exists to reach an inner include.
                    let mut scratch: Vec<String> = Vec::new();
                    walk_dir(&p, root, prefix, req, use_include, &mut scratch, gitignore);
                    continue;
                }
            }
            items.push(p);
        }
    }

    items.sort_by(|a, b| {
        b.is_dir()
            .cmp(&a.is_dir())
            .then(a.file_name().cmp(&b.file_name()))
    });

    let count = items.len();
    for (i, item) in items.iter().enumerate() {
        let is_last = i == count - 1;
        let connector = if is_last { "└── " } else { "├── " };
        let name = item
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let suffix = if item.is_dir() { "/" } else { "" };
        lines.push(format!("{}{}{}{}", prefix, connector, name, suffix));
        if item.is_dir() {
            let new_prefix = format!("{}{}", prefix, if is_last { "    " } else { "│   " });
            walk_dir(item, root, &new_prefix, req, use_include, lines, gitignore);
        }
    }
}