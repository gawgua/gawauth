use std::{path::PathBuf, str::FromStr};

#[allow(unused)]
fn main() {
    if !std::fs::exists("gen-protos/").unwrap_or(false) {
        std::fs::create_dir("gen-protos");
    }
    prost_build::Config::new()
        .out_dir(PathBuf::from_str("gen-protos/").unwrap_or_default())
        .compile_protos(&["protos/google_auth_migrate.proto"], &["protos/"])
        .unwrap();
    tauri_build::build();
}
