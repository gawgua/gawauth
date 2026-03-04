# gawauth

> A desktop authenticator app for managing TOTP (Time-Based One-Time Password) tokens, following [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238).

---

### Overview

gawauth lets you store and generate TOTP codes locally on your machine — the same kind of 6-digit codes used in two-factor authentication (2FA) across most services.

Tokens refresh every 30 seconds with a visual countdown timer so you always know how long a code is valid. Each token shows the issuer, account name, and a color-coded category badge to keep things organized at a glance.

---

### Features

- **Add tokens** manually via a secret key or by scanning a QR code image
- **Import tokens** from an `otpauth://` URI or a Google Authenticator QR code export
- **Search** across all your tokens by issuer or account name
- **Organize** tokens with categories and mark favorites
- **Delete** tokens you no longer need

> All data is stored locally — no cloud, no sync, no accounts required.
