use std::{fs, io, path::{Path, PathBuf}, process::Command};

use aes_gcm::{
	Aes256Gcm,
	aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
	Nonce,
};
use sha1::{Digest, Sha1};
use tauri::{AppHandle, Manager};

use crate::totp::TOTPAuth;

pub type AuthIndex = Vec<TOTPAuth>;

pub const AUTH_FILE_NAME: &str = "userdata.bin";

pub fn resolve_auth_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
	let config_dir = app_handle
		.path()
		.app_config_dir()
		.map_err(|e| format!("failed to resolve app config dir: {e}"))?;

	Ok(config_dir.join(AUTH_FILE_NAME))
}

fn get_hwid_hash() -> io::Result<[u8; 32]> {
	#[cfg(target_os = "windows")]
	{
		let hwid = if let Ok(output) = Command::new("wmic").args(["csproduct", "get", "UUID"]).output() {
			if output.status.success() {
				if let Ok(stdout) = String::from_utf8(output.stdout) {
					if let Some(value) = stdout
						.lines()
						.map(str::trim)
						.find(|line| !line.is_empty() && !line.eq_ignore_ascii_case("UUID"))
					{
						value.to_string()
					} else {
						String::new()
					}
				} else {
					String::new()
				}
			} else {
				String::new()
			}
		} else {
			String::new()
		};

		if hwid.trim().is_empty() {
			return Err(io::Error::new(io::ErrorKind::Other, "Unable to derive HWID"));
		}

		let hash = Sha1::digest(hwid.as_bytes());
		let mut key = [0u8; 32];
		key[..20].copy_from_slice(&hash);
		key[20..].copy_from_slice(&hash[..12]);
		return Ok(key);
	}

	#[cfg(not(target_os = "windows"))]
	{
		let hwid = if let Ok(machine_id) = fs::read_to_string("/etc/machine-id") {
			machine_id.trim().to_string()
		} else {
			std::env::var("HOSTNAME").unwrap_or_default()
		};

		if hwid.trim().is_empty() {
			return Err(io::Error::new(io::ErrorKind::Other, "Unable to derive HWID"));
		}

		let hash = Sha1::digest(hwid.as_bytes());
		let mut key = [0u8; 32];
		key[..20].copy_from_slice(&hash);
		key[20..].copy_from_slice(&hash[..12]);
		Ok(key)
	}
}

pub fn save_auth(path: impl AsRef<Path>, repo: &AuthIndex) -> std::io::Result<()> {
	let json = serde_json::to_vec(repo)
		.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Failed to serialize auth store: {e}")))?;

	let key = get_hwid_hash()?;

	let cipher = Aes256Gcm::new_from_slice(&key)
		.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Failed to initialize AES-256-GCM: {e}")))?;

	let mut nonce_bytes = [0u8; 12];
	OsRng.fill_bytes(&mut nonce_bytes);
	let nonce = Nonce::from_slice(&nonce_bytes);

	let ciphertext = cipher
		.encrypt(nonce, json.as_ref())
		.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Failed to encrypt auth store: {e}")))?;

	let mut output = Vec::with_capacity(12 + ciphertext.len());
	output.extend_from_slice(&nonce_bytes);
	output.extend_from_slice(&ciphertext);
	if let Some(parent_dir) = path.as_ref().parent() {
		fs::create_dir_all(parent_dir)?;
	}
	fs::write(path, output)
}

pub fn load_auth(path: impl AsRef<Path>) -> std::io::Result<AuthIndex> {
	let buf = fs::read(path)?;
	if buf.is_empty() {
		return Ok(AuthIndex::new());
	}
	if buf.len() < 12 {
		return Err(io::Error::new(io::ErrorKind::Other, "Encrypted auth file is invalid"));
	}

	let key = get_hwid_hash()?;

	let cipher = Aes256Gcm::new_from_slice(&key)
		.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Failed to initialize AES-256-GCM: {e}")))?;

	let (nonce_bytes, ciphertext) = buf.split_at(12);
	let nonce = Nonce::from_slice(nonce_bytes);
	let decrypted = cipher
		.decrypt(nonce, ciphertext)
		.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Failed to decrypt auth store: {e}")))?;

	serde_json::from_slice(&decrypted)
		.map_err(|e| io::Error::new(io::ErrorKind::Other, format!("Failed to parse decrypted auth store: {e}")))
}