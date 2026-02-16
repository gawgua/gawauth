use base64::{self, Engine, prelude::BASE64_STANDARD};
use prost::Message;
use crate::{google_auth_parser::google_auth_migrate::MigrationPayload, totp::TOTPAuth};

pub mod google_auth_migrate {
	include!("../gen-protos/google_auth_migrate.rs");
}

pub fn parse_from_base64(encoded: &str) -> Option<Vec<TOTPAuth>> {
	let decoded_bytes = BASE64_STANDARD.decode(encoded).ok()?;
	MigrationPayload::decode(decoded_bytes.as_slice()).ok().map(|payload| {
		payload
			.otp_parameters
			.into_iter()
			.filter_map(|param| {
				if param.r#type() == google_auth_migrate::OtpType::Totp {
					Some(TOTPAuth::new(
						Vec::from(param.secret()),
						String::from(param.name()),
						String::from(param.issuer()),
						match param.digits() {
							google_auth_migrate::DigitCount::Six => 6,
							google_auth_migrate::DigitCount::Eight => 8,
							_ => 0,
						},
					))
				} else {
					None
				}
			})
			.collect()
	})
}