# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Build Backend ---
FROM rust:1.75-slim AS backend-builder
WORKDIR /app/backend

# Install system dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Cache dependencies: Build a dummy project first
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Build actual source
COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

# --- Stage 3: Final Runtime ---
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/dist

# Copy backend binary from Stage 2
COPY --from=backend-builder /app/backend/target/release/project-combiner-backend /app/backend-bin

# Configuration
EXPOSE 8787
ENV PORT=8787
ENV STATIC_DIR=/app/dist
ENV RUST_LOG=info

# Start the application
CMD ["/app/backend-bin"]
