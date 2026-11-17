use base64::{self, Engine, prelude::BASE64_STANDARD};
use prost::Message;
use crate::{google_auth_parser::google_auth_migrate::MigrationPayload, totp::TOTPAuth};

pub mod google_auth_migrate {
	include!("../gen-protos/google_auth_migrate.rs");
}

pub fn parse_from_base64(encoded: &str) -> Option<Vec<TOTPAuth>> {
	let decoded_bytes = BASE64_STANDARD.decode(encoded.trim()).ok()?;
	MigrationPayload::decode(decoded_bytes.as_slice()).ok().map(|payload| {
		payload
			.otp_parameters
			.into_iter()
			.filter_map(|param| {
				if param.r#type() == google_auth_migrate::OtpType::Totp
					|| param.r#type() == google_auth_migrate::OtpType::Unspecified
				{
					let digits = match param.digits() {
						google_auth_migrate::DigitCount::Eight => 8,
						_ => 6,
					};
					let algorithm = match param.algorithm() {
						google_auth_migrate::Algorithm::Sha256 => "SHA256".to_string(),
						google_auth_migrate::Algorithm::Sha512 => "SHA512".to_string(),
						_ => "SHA1".to_string(),
					};
					Some(TOTPAuth::with_params(
						Vec::from(param.secret()),
						String::from(param.name()),
						String::from(param.issuer()),
						digits,
						algorithm,
						30,
					))
				} else {
					None
				}
			})
			.collect()
	})
}

pub fn parse_migration_uri(uri: &str) -> Result<Vec<TOTPAuth>, String> {
	let url_encoded_data = uri
		.trim()
		.strip_prefix("otpauth-migration://offline?data=")
		.ok_or_else(|| "invalid URI format".to_string())?;
	let data = urlencoding::decode(url_encoded_data)
		.map_err(|_| "failed to decode URI data".to_string())?;
	parse_from_base64(&data).ok_or_else(|| "failed to parse token from URI".to_string())
}
