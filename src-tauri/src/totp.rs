use std::time;

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use url::Url;

pub const DEFAULT_TOTP_PERIOD: u64 = 30;
pub const DEFAULT_TOTP_DIGITS: u32 = 6;

fn default_period() -> u64 {
	DEFAULT_TOTP_PERIOD
}

fn default_algorithm() -> String {
	"SHA1".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct TOTPAuth {
	pub secret: Vec<u8>,
	pub account_name: String,
	pub issuer: String,
	pub digits: u32,
	#[serde(default = "default_algorithm")]
	pub algorithm: String,
	#[serde(default = "default_period")]
	pub period: u64,
}

impl TOTPAuth {
	pub fn new(
		secret: Vec<u8>,
		account_name: String,
		issuer: String,
		digits: u32,
	) -> Self {
		Self {
			secret,
			account_name,
			issuer,
			digits: if digits == 0 { DEFAULT_TOTP_DIGITS } else { digits },
			algorithm: default_algorithm(),
			period: default_period(),
		}
	}

	pub fn with_params(
		secret: Vec<u8>,
		account_name: String,
		issuer: String,
		digits: u32,
		algorithm: String,
		period: u64,
	) -> Self {
		Self {
			secret,
			account_name,
			issuer,
			digits: if digits == 0 { DEFAULT_TOTP_DIGITS } else { digits },
			algorithm: if algorithm.trim().is_empty() {
				default_algorithm()
			} else {
				algorithm.trim().to_ascii_uppercase()
			},
			period: if period == 0 { DEFAULT_TOTP_PERIOD } else { period },
		}
	}

	pub fn generate_otp(&self) -> String {
		let now = get_unix_time();
		self.generate_otp_at(now)
	}

	pub fn generate_otp_at(&self, unix_time: u64) -> String {
		gen_otp_with_params(
			&self.secret,
			self.digits,
			self.period,
			&self.algorithm,
			unix_time,
		)
	}
}

type HmacSha1 = Hmac<Sha1>;
type HmacSha256 = Hmac<Sha256>;
type HmacSha512 = Hmac<Sha512>;

pub fn gen_otp_from_secret(secret: &[u8], digits: u32) -> String {
	gen_otp_at_time(secret, digits, get_unix_time())
}

pub fn gen_otp_at_time(secret: &[u8], digits: u32, unix_time: u64) -> String {
	gen_otp_with_params(secret, digits, DEFAULT_TOTP_PERIOD, "SHA1", unix_time)
}

pub fn gen_otp_with_params(
	secret: &[u8],
	digits: u32,
	period: u64,
	algorithm: &str,
	unix_time: u64,
) -> String {
	let effective_digits = if digits == 0 { DEFAULT_TOTP_DIGITS } else { digits };
	let effective_period = if period == 0 { DEFAULT_TOTP_PERIOD } else { period };
	let counter = (unix_time / effective_period).to_be_bytes();

	let hs: Vec<u8> = match algorithm.trim().to_ascii_uppercase().as_str() {
		"SHA256" => {
			let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key size");
			mac.update(&counter);
			mac.finalize().into_bytes().to_vec()
		}
		"SHA512" => {
			let mut mac = HmacSha512::new_from_slice(secret).expect("HMAC accepts any key size");
			mac.update(&counter);
			mac.finalize().into_bytes().to_vec()
		}
		_ => {
			let mut mac = HmacSha1::new_from_slice(secret).expect("HMAC accepts any key size");
			mac.update(&counter);
			mac.finalize().into_bytes().to_vec()
		}
	};

	let sbits = dynamic_truncation(&hs);
	let modulus = 10u64.pow(effective_digits);
	let code = ((sbits as u64) % modulus).to_string();
	if code.len() < effective_digits as usize {
		"0".repeat(effective_digits as usize - code.len()) + &code
	} else {
		code
	}
}

fn dynamic_truncation(hs: &[u8]) -> u32 {
	let offset = (hs[hs.len() - 1] & 0x0f) as usize;
	((hs[offset] as u32 & 0x7f) << 24)
		| ((hs[offset + 1] as u32 & 0xff) << 16)
		| ((hs[offset + 2] as u32 & 0xff) << 8)
		| (hs[offset + 3] as u32 & 0xff)
}

pub fn get_unix_time() -> u64 {
	time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.expect("Time went backwards")
		.as_secs()
}

pub fn decode_base32(input: &str) -> Result<Vec<u8>, String> {
	let cleaned: String = input
		.chars()
		.filter(|ch| !ch.is_whitespace() && *ch != '-')
		.collect::<String>()
		.trim_end_matches('=')
		.to_ascii_uppercase();

	if cleaned.is_empty() {
		return Err("secret key cannot be empty".to_string());
	}

	let mut buffer: u64 = 0;
	let mut bits_left: u32 = 0;
	let mut out = Vec::with_capacity(cleaned.len() * 5 / 8);

	for ch in cleaned.chars() {
		let val: u64 = match ch {
			'A'..='Z' => (ch as u8 - b'A') as u64,
			'2'..='7' => (ch as u8 - b'2' + 26) as u64,
			_ => return Err(format!("invalid Base32 character '{ch}' in secret key")),
		};
		buffer = (buffer << 5) | val;
		bits_left += 5;
		if bits_left >= 8 {
			bits_left -= 8;
			out.push(((buffer >> bits_left) & 0xff) as u8);
		}
	}

	if out.is_empty() {
		return Err("secret key is too short".to_string());
	}

	Ok(out)
}

pub fn encode_base32(bytes: &[u8]) -> String {
	const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	if bytes.is_empty() {
		return String::new();
	}

	let mut out = String::with_capacity((bytes.len() * 8 + 4) / 5);
	let mut buffer: u32 = 0;
	let mut bits_left: u32 = 0;

	for &byte in bytes {
		buffer = (buffer << 8) | (byte as u32);
		bits_left += 8;
		while bits_left >= 5 {
			bits_left -= 5;
			let idx = ((buffer >> bits_left) & 0x1f) as usize;
			out.push(ALPHABET[idx] as char);
		}
	}

	if bits_left > 0 {
		let idx = ((buffer << (5 - bits_left)) & 0x1f) as usize;
		out.push(ALPHABET[idx] as char);
	}

	out
}

pub fn parse_otpauth_uri(uri: &str) -> Result<TOTPAuth, String> {
	let parsed = Url::parse(uri.trim()).map_err(|e| format!("invalid otpauth URI: {e}"))?;
	if !parsed.scheme().eq_ignore_ascii_case("otpauth") {
		return Err("URI scheme must be otpauth".to_string());
	}

	let otp_type = parsed.host_str().unwrap_or("");
	if !otp_type.eq_ignore_ascii_case("totp") {
		return Err(format!("unsupported OTP type '{otp_type}', only totp is supported"));
	}

	let raw_label = parsed.path().trim_start_matches('/');
	let decoded_label = urlencoding::decode(raw_label)
		.map(|cow| cow.into_owned())
		.unwrap_or_else(|_| raw_label.to_string());

	let (label_issuer, label_account) = if let Some((prefix, rest)) = decoded_label.split_once(':') {
		(prefix.trim().to_string(), rest.trim().to_string())
	} else {
		(String::new(), decoded_label.trim().to_string())
	};

	let mut secret_str: Option<String> = None;
	let mut param_issuer: Option<String> = None;
	let mut digits: u32 = DEFAULT_TOTP_DIGITS;
	let mut algorithm = default_algorithm();
	let mut period: u64 = DEFAULT_TOTP_PERIOD;

	for (key, value) in parsed.query_pairs() {
		match key.to_ascii_lowercase().as_str() {
			"secret" => secret_str = Some(value.into_owned()),
			"issuer" => param_issuer = Some(value.trim().to_string()),
			"digits" => {
				let parsed_digits = value
					.trim()
					.parse::<u32>()
					.map_err(|_| "invalid digits parameter in otpauth URI".to_string())?;
				if parsed_digits != 6 && parsed_digits != 8 {
					return Err(format!("unsupported digits count {parsed_digits}"));
				}
				digits = parsed_digits;
			}
			"algorithm" => {
				let alg = value.trim().to_ascii_uppercase();
				match alg.as_str() {
					"SHA1" | "SHA256" | "SHA512" => algorithm = alg,
					_ => return Err(format!("unsupported TOTP algorithm '{alg}'")),
				}
			}
			"period" => {
				let parsed_period = value
					.trim()
					.parse::<u64>()
					.map_err(|_| "invalid period parameter in otpauth URI".to_string())?;
				if parsed_period == 0 {
					return Err("period must be greater than zero".to_string());
				}
				period = parsed_period;
			}
			_ => {}
		}
	}

	let secret_raw = secret_str.ok_or_else(|| "missing secret parameter in otpauth URI".to_string())?;
	let secret = decode_base32(&secret_raw)?;

	let issuer = param_issuer
		.filter(|s| !s.is_empty())
		.unwrap_or(label_issuer);

	let account_name = if !label_account.is_empty() {
		label_account
	} else if !issuer.is_empty() {
		issuer.clone()
	} else {
		"Account".to_string()
	};

	Ok(TOTPAuth::with_params(
		secret,
		account_name,
		issuer,
		digits,
		algorithm,
		period,
	))
}
