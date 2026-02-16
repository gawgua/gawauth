use std::time;

use serde::{Deserialize, Serialize};
use hmac::{Hmac, Mac};
use sha1::Sha1;

const TOTP_TIME_STEP: u64 = 30;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TOTPAuth {
    pub secret: Vec<u8>,
    pub account_name: String,
    pub issuer: String,
    pub digits: u32,
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
            digits,
        }
    }
}

type HmacSha1 = Hmac<Sha1>;

// Follow RFC 4226 to create HOTP, use time counter to create TOTP
pub fn gen_otp_from_secret(secret: &Vec<u8>, digits: u32) -> String {
	// Step 1: HS = HMAC-SHA-1(K, C) (HS = 20 bytes)
    let mut mac = HmacSha1::new_from_slice(&secret).expect("HMAC can take key of any size");
	mac.update(get_time_counter().to_be_bytes().as_ref());
	let hs = mac.finalize().into_bytes().to_vec();
	// Step 2: Sbits = DynamicTruncation(HS) (Sbits = 31 bits = 4 bytes)
	let sbits = dynamic_truncation(&hs);
	// Step 3: Snum = StToNum(Sbits) (Snum = integer)
	// Return D = Snum % 10^digits
	let d = (sbits % 10u32.pow(digits)).to_string();
	if (d.len() < digits as usize) {
		// Pad with leading zeros if necessary
		return "0".repeat(digits as usize - d.len()) + &d;
	} else {
		return d;
	}
}

fn dynamic_truncation(hs: &Vec<u8>) -> u32 {
	// 5.4 of RFC 4226
	let offset = (hs[19] & 0x0f) as usize;
	let bin_code = ((hs[offset] as u32 & 0x7f) << 24)
		| ((hs[offset + 1] as u32 & 0xff) << 16)
		| ((hs[offset + 2] as u32 & 0xff) << 8)
		| (hs[offset + 3] as u32 & 0xff);
	
	bin_code
}

fn get_time_counter() -> u64 {
	let unix_time = time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.expect("Time went backwards")
		.as_secs();
	unix_time / TOTP_TIME_STEP
}