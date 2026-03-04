mod google_auth_parser;
mod totp;
mod storage;
mod config;

use std::sync::Mutex;
use sha1::Digest;
use tauri::{AppHandle, LogicalSize, Manager, State};
use crate::config::{Config, resolve_config_path};
use crate::{storage::{AuthIndex, load_auth, resolve_auth_path, save_auth}};

#[tauri::command]
fn get_config(config: State<Mutex<Config>>, app_handle: AppHandle) -> String {
	let config_path = match resolve_config_path(&app_handle) {
		Ok(path) => path,
		Err(_) => {
			return match config.inner().lock() {
				Ok(guard) => guard.to_json(),
				Err(_) => Config::default().to_json(),
			};
		}
	};

	let loaded = Config::load_or_default(&config_path);
	match config.inner().lock() {
		Ok(mut guard) => {
			*guard = loaded.clone();
			guard.to_json()
		}
		Err(_) => loaded.to_json(),
	}
}

#[tauri::command]
fn set_config(config: String, config_state: State<Mutex<Config>>, app_handle: AppHandle) -> Result<String, String> {
	let parsed_config = Config::from_json(&config)?;

	{
		let mut state = config_state
			.inner()
			.lock()
			.map_err(|_| "failed to lock config state".to_string())?;
		*state = parsed_config.clone();
	}

	let config_path = resolve_config_path(&app_handle)?;
	parsed_config
		.save(&config_path)
		.map_err(|e| format!("failed to save config: {e}"))?;

	Ok(parsed_config.to_json())
}

#[tauri::command]
fn import_token_from_uri(uri: String, auth_index: State<Mutex<AuthIndex>>, app_handle: AppHandle) -> Result<(), String> {
	let url_encoded_data = uri.strip_prefix("otpauth-migration://offline?data=").ok_or("invalid URI format")?;
	let data = urlencoding::decode(url_encoded_data).map_err(|_| "failed to decode URI data")?;
	if let Some(tokens) = google_auth_parser::parse_from_base64(&data) {
		let mut index = auth_index
			.inner()
			.lock()
			.map_err(|_| "failed to lock auth index")?;
		index.extend(tokens);
		let auth_path = resolve_auth_path(&app_handle)?;
		save_auth(&auth_path, &index).map_err(|e| e.to_string())?;
		Ok(())
	} else {
		Err("failed to parse token from URI".into())
	}
}

#[tauri::command]
fn get_all_tokens(auth_index: State<Mutex<AuthIndex>>, app_handle: AppHandle) -> String {
	if let Ok(auth_path) = resolve_auth_path(&app_handle) {
		if let Ok(loaded) = load_auth(&auth_path) {
			if let Ok(mut guard) = auth_index.inner().lock() {
				*guard = loaded;
			}
		}
	}

	let index = match auth_index.inner().lock() {
		Ok(guard) => guard,
		Err(_) => return String::new(),
	};
	index.iter().map(|auth| {
		let otp = totp::gen_otp_from_secret(&auth.secret, auth.digits);
		// hash account name and issuer to create a unique ID for the token
		let mut hasher = sha1::Sha1::new();
		hasher.update(auth.account_name.as_bytes());
		hasher.update(auth.issuer.as_bytes());
		let id = format!("{:x}", hasher.finalize());
		format!("{{\"id\": \"{}\",\"account_name\": \"{}\",\"issuer\": \"{}\",\"digits\": {},\"otp\": \"{}\"}}", 
				id, auth.account_name, auth.issuer, auth.digits, otp)
	}).collect::<Vec<String>>().join("\n")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let auth_index = AuthIndex::new();
	let config = Config::default();

    tauri::Builder::default()
		.setup(|app| {
			if let Some(window) = app.get_webview_window("main") {
				window.set_resizable(false)?;
				window.set_size(LogicalSize::new(1024, 768))?;

				Ok(())
			} else {
				Err("failed to get window".into())
			}
		})
		.manage(Mutex::new(auth_index))
		.manage(Mutex::new(config))
		.plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![import_token_from_uri, get_all_tokens, get_config, set_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
