mod combiner;
mod models;
mod search;
mod tree;

use axum::{
    extract::Query,
    routing::{get, post},
    Json, Router,
};
use models::*;
use serde::Deserialize;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

#[derive(Deserialize)]
struct PreviewQuery {
    path: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/browse", post(browse_dir))
        .route("/api/combine", post(combine))
        .route("/api/search", post(search_files))
        .route("/api/tree", post(get_tree))
        .route("/api/preview", get(preview_file))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8787));
    tracing::info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}

async fn browse_dir(Json(req): Json<BrowseRequest>) -> Json<BrowseResponse> {
    let path = std::path::PathBuf::from(&req.path);
    tracing::info!("browse_dir: requested path = {:?}", path);
    if !path.exists() || !path.is_dir() {
        let msg = format!(
            "Directory not found or not a directory: {:?} (exists={}, is_dir={})",
            path,
            path.exists(),
            path.is_dir()
        );
        tracing::warn!("{}", msg);
        return Json(BrowseResponse {
            success: false,
            error: Some(msg),
            entries: vec![],
        });
    }
    let mut entries = vec![];
    match std::fs::read_dir(&path) {
        Ok(read) => {
            for entry in read.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let entry_path = entry.path().to_string_lossy().to_string();
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                entries.push(FileEntry { name, path: entry_path, is_dir });
            }
        }
        Err(e) => {
            let msg = format!("read_dir failed for {:?}: {}", path, e);
            tracing::error!("{}", msg);
            return Json(BrowseResponse {
                success: false,
                error: Some(msg),
                entries: vec![],
            });
        }
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Json(BrowseResponse {
        success: true,
        error: None,
        entries,
    })
}

async fn combine(Json(req): Json<CombineRequest>) -> Json<CombineResponse> {
    match combiner::combine_files(req) {
        Ok(resp) => Json(resp),
        Err(e) => Json(CombineResponse {
            success: false,
            output_path: String::new(),
            files_processed: 0,
            total_size: 0,
            duplicates: vec![],
            log: vec![format!("❌ Error: {}", e)],
        }),
    }
}

async fn search_files(Json(req): Json<SearchRequest>) -> Json<SearchResponse> {
    Json(search::search_files(req))
}

async fn get_tree(Json(req): Json<TreeRequest>) -> Json<TreeResponse> {
    Json(tree::generate_tree(req))
}

async fn preview_file(Query(q): Query<PreviewQuery>) -> Json<serde_json::Value> {
    match std::fs::read_to_string(&q.path) {
        Ok(content) => {
            // Cap preview at ~2MB to avoid blowing up the browser
            let capped = if content.len() > 2 * 1024 * 1024 {
                format!(
                    "{}...\n\n[Preview truncated at 2 MB — full file is at {}]",
                    &content[..2 * 1024 * 1024],
                    q.path
                )
            } else {
                content
            };
            Json(serde_json::json!({ "content": capped }))
        }
        Err(e) => Json(serde_json::json!({
            "error": format!("Could not read '{}': {}", q.path, e)
        })),
    }
}