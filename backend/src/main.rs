mod combiner;
mod models;
mod search;
mod tree;

use axum::{
    extract::{Multipart, Query},
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
    // Initialize logging
    tracing_subscriber::fmt::init();

    // Permissive CORS for development; in production, the backend serves the frontend
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Get configuration from environment variables
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "../frontend/dist".to_string());
    let index_path = format!("{}/index.html", static_dir);
    
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8787".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid number");

    // Build the application router
    let app = Router::new()
        // API Routes
        .route("/api/health", get(health))
        .route("/api/browse", post(browse_dir))
        .route("/api/combine", post(combine))
        .route("/api/combine-upload", post(combine_upload))
        .route("/api/search", post(search_files))
        .route("/api/tree", post(get_tree))
        .route("/api/preview", get(preview_file))
        // Static File Serving (Frontend)
        .fallback_service(
            tower_http::services::ServeDir::new(&static_dir)
                .fallback(tower_http::services::ServeFile::new(index_path)),
        )
        .layer(cors);

    // Bind to 0.0.0.0 for Docker/Render compatibility
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🚀 Server starting on {}", addr);
    tracing::info!("📁 Serving static files from {}", static_dir);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}

async fn browse_dir(Json(req): Json<BrowseRequest>) -> Json<BrowseResponse> {
    let path = std::path::PathBuf::from(&req.path);
    if !path.exists() || !path.is_dir() {
        let msg = format!("Directory not found: {:?}", path);
        return Json(BrowseResponse {
            success: false,
            error: Some(msg),
            entries: vec![],
        });
    }
    let mut entries = vec![];
    if let Ok(read) = std::fs::read_dir(&path) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let entry_path = entry.path().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            entries.push(FileEntry { name, path: entry_path, is_dir });
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
            content: None,
            files_processed: 0,
            total_size: 0,
            duplicates: vec![],
            log: vec![format!("❌ Error: {}", e)],
        }),
    }
}

async fn combine_upload(mut multipart: Multipart) -> Json<CombineResponse> {
    let mut files = vec![];
    let mut config = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "config" {
            if let Ok(bytes) = field.bytes().await {
                if let Ok(req) = serde_json::from_slice::<CombineRequest>(&bytes) {
                    config = Some(req);
                }
            }
        } else if name == "files" {
            let file_name = field.file_name().unwrap_or_default().to_string();
            if let Ok(content) = field.text().await {
                files.push((file_name, content));
            }
        }
    }

    let Some(req) = config else {
        return Json(CombineResponse {
            success: false,
            output_path: String::new(),
            content: None,
            files_processed: 0,
            total_size: 0,
            duplicates: vec![],
            log: vec!["❌ Error: Missing configuration in multipart request".to_string()],
        });
    };

    match combiner::combine_uploaded_files(req, files) {
        Ok(resp) => Json(resp),
        Err(e) => Json(CombineResponse {
            success: false,
            output_path: String::new(),
            content: None,
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
            let capped = if content.len() > 2 * 1024 * 1024 {
                format!("{}...\n\n[Preview truncated at 2 MB]", &content[..2 * 1024 * 1024])
            } else {
                content
            };
            Json(serde_json::json!({ "content": capped }))
        }
        Err(e) => Json(serde_json::json!({ "error": e.to_string() })),
    }
}