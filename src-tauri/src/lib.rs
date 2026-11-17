pub mod camera;
pub mod config;
pub mod google_auth_parser;
pub mod qr_codec;
pub mod qr_reader;
pub mod storage;
pub mod totp;

use std::{
	path::Path,
	sync::{
		Arc, Mutex,
		atomic::{AtomicBool, Ordering},
	},
	thread,
	time::{Duration, Instant},
};

use base64::{Engine, prelude::BASE64_STANDARD};
use serde::Serialize;
use sha1::Digest;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, State};

use crate::{
	camera::CameraController,
	config::{Config, resolve_config_path},
	qr_reader::decode_qr_from_frame,
	storage::{AuthIndex, load_auth, resolve_auth_path, save_auth},
	totp::{DEFAULT_TOTP_DIGITS, TOTPAuth, decode_base32, parse_otpauth_uri},
};

pub struct CameraScanSession {
	stop_flag: Arc<AtomicBool>,
}

impl CameraScanSession {
	pub fn stop(&self) {
		self.stop_flag.store(true, Ordering::SeqCst);
	}
}

#[derive(Serialize)]
struct TokenRecordOutput<'a> {
	id: String,
	account_name: &'a str,
	issuer: &'a str,
	digits: u32,
	otp: String,
}

pub fn parse_tokens_from_key_input(
	input: &str,
	issuer_override: Option<&str>,
	account_override: Option<&str>,
	digits_override: Option<u32>,
) -> Result<Vec<TOTPAuth>, String> {
	let trimmed = input.trim();
	if trimmed.is_empty() {
		return Err("secret or URI cannot be empty".to_string());
	}

	if trimmed.starts_with("otpauth-migration://") {
		return google_auth_parser::parse_migration_uri(trimmed);
	}

	if trimmed.len() >= 10 && trimmed[..10].eq_ignore_ascii_case("otpauth://") {
		let mut token = parse_otpauth_uri(trimmed)?;
		if let Some(issuer) = issuer_override.map(str::trim).filter(|s| !s.is_empty()) {
			token.issuer = issuer.to_string();
		}
		if let Some(account) = account_override.map(str::trim).filter(|s| !s.is_empty()) {
			token.account_name = account.to_string();
		}
		if let Some(digits) = digits_override.filter(|&d| d == 6 || d == 8) {
			token.digits = digits;
		}
		return Ok(vec![token]);
	}

	let secret = decode_base32(trimmed)?;
	let issuer = issuer_override
		.map(str::trim)
		.unwrap_or("")
		.to_string();
	let account_raw = account_override.map(str::trim).unwrap_or("");
	let account_name = if !account_raw.is_empty() {
		account_raw.to_string()
	} else if !issuer.is_empty() {
		issuer.clone()
	} else {
		"Account".to_string()
	};
	let digits = digits_override
		.filter(|&d| d == 6 || d == 8)
		.unwrap_or(DEFAULT_TOTP_DIGITS);

	Ok(vec![TOTPAuth::new(secret, account_name, issuer, digits)])
}

pub fn load_tokens_from_qr_image(path: impl AsRef<Path>) -> Result<(String, Vec<TOTPAuth>), String> {
	let decoded_text = qr_reader::read_qr_from_image(path)?;
	let tokens = parse_tokens_from_key_input(&decoded_text, None, None, None)?;
	Ok((decoded_text, tokens))
}

pub fn upsert_tokens(index: &mut AuthIndex, incoming: Vec<TOTPAuth>) {
	for token in incoming {
		if let Some(existing) = index.iter_mut().find(|item| {
			item.account_name == token.account_name && item.issuer == token.issuer
		}) {
			*existing = token;
		} else {
			index.push(token);
		}
	}
}

fn persist_tokens(
	tokens: Vec<TOTPAuth>,
	auth_index: &State<Mutex<AuthIndex>>,
	app_handle: &AppHandle,
) -> Result<(), String> {
	let auth_path = resolve_auth_path(app_handle)?;
	let mut index = auth_index
		.inner()
		.lock()
		.map_err(|_| "failed to lock auth index".to_string())?;
	if index.is_empty() {
		if let Ok(loaded) = load_auth(&auth_path) {
			*index = loaded;
		}
	}
	upsert_tokens(&mut index, tokens);
	save_auth(&auth_path, &index).map_err(|e| e.to_string())
}

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
fn set_config(
	config: String,
	config_state: State<Mutex<Config>>,
	app_handle: AppHandle,
) -> Result<String, String> {
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
fn add_token_from_secret(
	secret: String,
	issuer: Option<String>,
	account: Option<String>,
	digits: Option<u32>,
	auth_index: State<Mutex<AuthIndex>>,
	app_handle: AppHandle,
) -> Result<(), String> {
	let tokens = parse_tokens_from_key_input(
		&secret,
		issuer.as_deref(),
		account.as_deref(),
		digits,
	)?;
	persist_tokens(tokens, &auth_index, &app_handle)
}

#[tauri::command]
fn import_token_from_uri(
	uri: String,
	auth_index: State<Mutex<AuthIndex>>,
	app_handle: AppHandle,
) -> Result<(), String> {
	let trimmed = uri.trim();
	let tokens = if trimmed.starts_with("otpauth-migration://") {
		google_auth_parser::parse_migration_uri(trimmed)?
	} else if trimmed.len() >= 10 && trimmed[..10].eq_ignore_ascii_case("otpauth://") {
		vec![parse_otpauth_uri(trimmed)?]
	} else {
		return Err("invalid URI format".to_string());
	};
	persist_tokens(tokens, &auth_index, &app_handle)
}

#[tauri::command]
fn read_qr_from_image(image_path: String) -> Result<String, String> {
	qr_reader::read_qr_from_image(image_path)
}

#[tauri::command]
fn add_token_from_qr(
	image_path: String,
	auth_index: State<Mutex<AuthIndex>>,
	app_handle: AppHandle,
) -> Result<String, String> {
	let (decoded_text, tokens) = load_tokens_from_qr_image(image_path)?;
	persist_tokens(tokens, &auth_index, &app_handle)?;
	Ok(decoded_text)
}

#[tauri::command]
fn import_token_from_qr(
	image_path: String,
	auth_index: State<Mutex<AuthIndex>>,
	app_handle: AppHandle,
) -> Result<String, String> {
	let (decoded_text, tokens) = load_tokens_from_qr_image(image_path)?;
	persist_tokens(tokens, &auth_index, &app_handle)?;
	Ok(decoded_text)
}

#[tauri::command]
fn check_camera_available() -> bool {
	CameraController::is_available()
}

#[tauri::command]
fn read_qr_from_camera(timeout_ms: Option<u64>) -> Result<String, String> {
	let controller = CameraController::open()?;
	let stream = controller.start_stream()?;
	let deadline = Instant::now() + Duration::from_millis(timeout_ms.unwrap_or(15_000));

	while Instant::now() < deadline {
		let remaining = deadline.saturating_duration_since(Instant::now());
		let wait = remaining.min(Duration::from_millis(250));
		if let Ok(frame) = stream.recv_timeout(wait) {
			if let Ok(decoded) = decode_qr_from_frame(&frame) {
				stream.stop();
				return Ok(decoded);
			}
		}
	}

	stream.stop();
	Err("timed out waiting for QR code from camera".to_string())
}

#[tauri::command]
fn start_camera_scan(
	camera_session: State<Mutex<Option<CameraScanSession>>>,
	app_handle: AppHandle,
) -> Result<(), String> {
	{
		let mut guard = camera_session
			.inner()
			.lock()
			.map_err(|_| "failed to lock camera session".to_string())?;
		if let Some(prev) = guard.take() {
			prev.stop();
		}
	}

	let controller = CameraController::open()?;
	let stream = controller.start_stream()?;
	let stop_flag = Arc::new(AtomicBool::new(false));

	{
		let mut guard = camera_session
			.inner()
			.lock()
			.map_err(|_| "failed to lock camera session".to_string())?;
		*guard = Some(CameraScanSession {
			stop_flag: Arc::clone(&stop_flag),
		});
	}

	let handle_clone = app_handle.clone();
	thread::spawn(move || {
		let mut last_preview = Instant::now()
			.checked_sub(Duration::from_millis(200))
			.unwrap_or_else(Instant::now);

		while !stop_flag.load(Ordering::SeqCst) {
			match stream.recv_timeout(Duration::from_millis(200)) {
				Ok(frame) => {
					if last_preview.elapsed() >= Duration::from_millis(100) {
						if let Ok(png_bytes) = frame.to_png_bytes() {
							let b64 = BASE64_STANDARD.encode(png_bytes);
							let _ = handle_clone.emit("camera-frame", b64);
						}
						last_preview = Instant::now();
					}

					if let Ok(decoded) = decode_qr_from_frame(&frame) {
						let _ = handle_clone.emit("camera-qr-detected", decoded);
						break;
					}
				}
				Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
				Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
			}
		}

		stream.stop();
	});

	Ok(())
}

#[tauri::command]
fn stop_camera_scan(
	camera_session: State<Mutex<Option<CameraScanSession>>>,
) -> Result<(), String> {
	if let Ok(mut guard) = camera_session.inner().lock() {
		if let Some(session) = guard.take() {
			session.stop();
		}
	}
	Ok(())
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
	index
		.iter()
		.filter_map(|auth| {
			let otp = auth.generate_otp();
			let mut hasher = sha1::Sha1::new();
			hasher.update(auth.account_name.as_bytes());
			hasher.update(auth.issuer.as_bytes());
			let id = format!("{:x}", hasher.finalize());
			serde_json::to_string(&TokenRecordOutput {
				id,
				account_name: &auth.account_name,
				issuer: &auth.issuer,
				digits: auth.digits,
				otp,
			})
			.ok()
		})
		.collect::<Vec<String>>()
		.join("\n")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let auth_index = AuthIndex::new();
	let config = Config::default();
	let camera_session: Option<CameraScanSession> = None;

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
		.manage(Mutex::new(camera_session))
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_opener::init())
		.invoke_handler(tauri::generate_handler![
			import_token_from_uri,
			import_token_from_qr,
			add_token_from_secret,
			add_token_from_qr,
			read_qr_from_image,
			check_camera_available,
			start_camera_scan,
			stop_camera_scan,
			read_qr_from_camera,
			get_all_tokens,
			get_config,
			set_config
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
