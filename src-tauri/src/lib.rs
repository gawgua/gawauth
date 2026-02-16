mod google_auth_parser;
mod totp;
mod storage;

use std::sync::Mutex;
use tauri::{LogicalSize, Manager, State};
use crate::{storage::{AUTH_FILE_PATH, AuthIndex, load_auth, save_auth}};

#[tauri::command]
fn import_token_from_uri(uri: String, auth_index: State<Mutex<AuthIndex>>) -> Result<(), String> {
	let url_encoded_data = uri.strip_prefix("otpauth-migration://offline?data=").ok_or("invalid URI format")?;
	let data = urlencoding::decode(url_encoded_data).map_err(|_| "failed to decode URI data")?;
	if let Some(tokens) = google_auth_parser::parse_from_base64(&data) {
		let mut index = auth_index
			.inner()
			.lock()
			.map_err(|_| "failed to lock auth index")?;
		index.extend(tokens);
		save_auth(AUTH_FILE_PATH, &index).map_err(|e| e.to_string())?;
		Ok(())
	} else {
		Err("failed to parse token from URI".into())
	}
}

#[tauri::command]
fn get_all_tokens(auth_index: State<Mutex<AuthIndex>>) -> String {
	let index = match auth_index.inner().lock() {
		Ok(guard) => guard,
		Err(_) => return String::new(),
	};
	index.iter().map(|auth| {
		let otp = totp::gen_otp_from_secret(&auth.secret, auth.digits);
		format!("{{\"account_name\": \"{}\",\"issuer\": \"{}\",\"digits\": {},\"otp\": \"{}\"}}", 
				auth.account_name, auth.issuer, auth.digits, otp)
	}).collect::<Vec<String>>().join("\n")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let auth_index = load_auth(AUTH_FILE_PATH).unwrap_or_else(|_| AuthIndex::new());

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
		.plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![import_token_from_uri, get_all_tokens])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
