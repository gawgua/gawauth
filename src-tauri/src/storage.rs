use std::{fs::{self, File}, io::{Read, Write}};
use aes::{Aes256, cipher::KeyInit};
use crate::totp::TOTPAuth;

pub type AuthIndex = Vec<TOTPAuth>;

pub const AUTH_FILE_PATH: &str = "auth_store.json";

pub fn save_auth(path: &str, repo: &AuthIndex) -> std::io::Result<()> {
	let json = serde_json::to_string(repo)?;
	// feed json to aes256 encryption here
	let mut save = File::create(path)?;
	save.write(json.as_bytes())?;

	Ok(())
}

pub fn load_auth(path: &str) -> std::io::Result<AuthIndex> {
	let mut save = File::open(path)?;
	let mut buf = Vec::new();
	save.read_to_end(&mut buf)?;
	// decrypt aes256 here to get json
	let json = String::from_utf8(buf).expect("Invalid UTF-8 data");
	let repo: AuthIndex = serde_json::from_str(&json)?;
	Ok(repo)
}