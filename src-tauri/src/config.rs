use std::{fs, io, path::{Path, PathBuf}};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub const CONFIG_FILE_NAME: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
	#[serde(default)]
	pub favourites: Vec<String>,
}

impl Config {
	pub fn from_json(json: &str) -> Result<Self, String> {
		serde_json::from_str(json).map_err(|e| format!("failed to parse config json: {e}"))
	}

	pub fn to_json(&self) -> String {
		serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
	}

	pub fn load(path: impl AsRef<Path>) -> io::Result<Self> {
		let content = fs::read_to_string(path)?;
		let config = serde_json::from_str(&content)
			.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("failed to parse config file: {e}")))?;
		Ok(config)
	}

	pub fn save(&self, path: impl AsRef<Path>) -> io::Result<()> {
		let json = serde_json::to_string(self)
			.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("failed to serialize config: {e}")))?;
		if let Some(parent_dir) = path.as_ref().parent() {
			fs::create_dir_all(parent_dir)?;
		}
		fs::write(path, json)
	}

	pub fn load_or_default(path: impl AsRef<Path>) -> Self {
		Self::load(path).unwrap_or_default()
	}
}

pub fn resolve_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
	let config_dir = app_handle
		.path()
		.app_config_dir()
		.map_err(|e| format!("failed to resolve app config dir: {e}"))?;

	Ok(config_dir.join(CONFIG_FILE_NAME))
}