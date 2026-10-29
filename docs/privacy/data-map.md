# Personal-data map (implemented scope)

This map covers the account and profile features currently in the repository. Future document, sharing, analytics and notification flows must be added before implementation.

| Data | Store and purpose | Access and legal basis | Retention / deletion |
|---|---|---|---|
| Email, password hash, locale, account status | MariaDB `users`; sign-in, verification and account language | Account owner and identity service; account service | Until account deletion; deletion cascades to sessions, challenges and profiles |
| Session token hash and expiry | MariaDB `sessions`; validate and revoke sessions | Identity service only; necessary for account access | 30 days or until revocation; deleted with account |
| Verification and reset token hashes | MariaDB `verification_challenges`; one-time account actions | Identity service only; account security | 30 minutes; used tokens remain until account deletion or cleanup job |
| Login throttling key hash and count | MariaDB `login_attempt_limits`; prevent brute force and message abuse | Identity service only; security purpose | 15-minute logical window; physical cleanup job not implemented yet |
| Person names, birth date, contact/address, profession, CIN/passport if entered | AES-256-GCM ciphertext in MariaDB `person_profiles`; prefill documents | Owning account only, enforced by `owner_user_id`; self-entry or attested consent/legal authority for another person | Until owner deletes profile or account; hard delete from primary DB |
| Email verification/reset address and link | SMTP configured by operator; deliver account action link | User's email provider processes message; account-security purpose | Mail retention is controlled by the configured SMTP provider; app does not retain message body |

No profile data is sent to Meilisearch, analytics, logs or error responses. The profile encryption key is configured outside the repository. Backups, key rotation, account-wide export/deletion requests and retention workers are not implemented yet; profile deletion currently covers the primary MariaDB row only.
