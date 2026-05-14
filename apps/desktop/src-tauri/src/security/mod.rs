use std::{collections::HashMap, fs, path::PathBuf};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use keyring::Entry;
use pbkdf2::pbkdf2_hmac;
use rand::{rngs::OsRng, RngCore};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::domain::{
    error::CommandError,
    models::{
        ConnectionProfile, EnvironmentProfile, GuardrailDecision, ResolvedEnvironment, SecretRef,
    },
};

pub const SAFE_MODE_LABEL: &str = "production-safe-mode";
const EXPORT_KDF: &str = "pbkdf2-sha256";
const EXPORT_KDF_ITERATIONS: u32 = 210_000;

pub trait SecretStore {
    fn store_secret(&self, secret_ref: &SecretRef, secret: &str) -> Result<(), CommandError>;
    fn resolve_secret(&self, secret_ref: &SecretRef) -> Result<String, CommandError>;
}

pub struct KeyringSecretStore;

pub struct FileSecretStore;

impl SecretStore for KeyringSecretStore {
    fn store_secret(&self, secret_ref: &SecretRef, secret: &str) -> Result<(), CommandError> {
        let entry = Entry::new(&secret_ref.service, &secret_ref.account)
            .map_err(|error| CommandError::new("secret-store", error.to_string()))?;
        entry
            .set_password(secret)
            .map_err(|error| CommandError::new("secret-store", error.to_string()))
    }

    fn resolve_secret(&self, secret_ref: &SecretRef) -> Result<String, CommandError> {
        let entry = Entry::new(&secret_ref.service, &secret_ref.account)
            .map_err(|error| CommandError::new("secret-store", error.to_string()))?;
        entry
            .get_password()
            .map_err(|error| CommandError::new("secret-store", error.to_string()))
    }
}

impl SecretStore for FileSecretStore {
    fn store_secret(&self, secret_ref: &SecretRef, secret: &str) -> Result<(), CommandError> {
        let path = file_secret_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut secrets = read_file_secrets(&path)?;
        secrets.insert(file_secret_key(secret_ref), secret.to_string());
        fs::write(path, serde_json::to_string_pretty(&secrets)?)?;
        Ok(())
    }

    fn resolve_secret(&self, secret_ref: &SecretRef) -> Result<String, CommandError> {
        let path = file_secret_path();
        let secrets = read_file_secrets(&path)?;
        if let Some(secret) = secrets.get(&file_secret_key(secret_ref)).cloned() {
            return Ok(secret);
        }

        for legacy_path in legacy_file_secret_paths() {
            if legacy_path == path {
                continue;
            }
            let legacy_secrets = read_file_secrets(&legacy_path)?;
            if let Some(secret) = legacy_secrets.get(&file_secret_key(secret_ref)).cloned() {
                return Ok(secret);
            }
        }

        Err(CommandError::new("secret-store", "Secret was not found."))
    }
}

pub fn using_file_secret_store() -> bool {
    env_value(&[
        "DATAPADPLUSPLUS_SECRET_STORE",
        "DATANAUT_SECRET_STORE",
        "UNIVERSALITY_SECRET_STORE",
    ])
    .map(|value| value.eq_ignore_ascii_case("file"))
    .unwrap_or(false)
}

pub fn store_secret_value(secret_ref: &SecretRef, secret: &str) -> Result<(), CommandError> {
    if using_file_secret_store() {
        FileSecretStore.store_secret(secret_ref, secret)
    } else {
        KeyringSecretStore.store_secret(secret_ref, secret)
    }
}

pub fn resolve_secret_value(secret_ref: &SecretRef) -> Result<String, CommandError> {
    if using_file_secret_store() {
        FileSecretStore.resolve_secret(secret_ref)
    } else {
        KeyringSecretStore.resolve_secret(secret_ref)
    }
}

fn file_secret_path() -> PathBuf {
    if let Some(path) = env_value(&[
        "DATAPADPLUSPLUS_SECRET_FILE",
        "DATANAUT_SECRET_FILE",
        "UNIVERSALITY_SECRET_FILE",
    ]) {
        return PathBuf::from(path);
    }

    if let Some(workspace_dir) = env_value(&[
        "DATAPADPLUSPLUS_WORKSPACE_DIR",
        "DATANAUT_WORKSPACE_DIR",
        "UNIVERSALITY_WORKSPACE_DIR",
    ]) {
        return PathBuf::from(workspace_dir).join("secrets.json");
    }

    std::env::temp_dir()
        .join("datapadplusplus")
        .join("secrets.json")
}

fn legacy_file_secret_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(path) = std::env::var("DATANAUT_SECRET_FILE") {
        paths.push(PathBuf::from(path));
    }

    if let Ok(path) = std::env::var("UNIVERSALITY_SECRET_FILE") {
        paths.push(PathBuf::from(path));
    }

    if let Ok(workspace_dir) = std::env::var("DATANAUT_WORKSPACE_DIR") {
        paths.push(PathBuf::from(workspace_dir).join("secrets.json"));
    }

    if let Ok(workspace_dir) = std::env::var("UNIVERSALITY_WORKSPACE_DIR") {
        paths.push(PathBuf::from(workspace_dir).join("secrets.json"));
    }

    paths.push(std::env::temp_dir().join("datanaut").join("secrets.json"));
    paths.push(
        std::env::temp_dir()
            .join("universality")
            .join("secrets.json"),
    );
    paths
}

fn read_file_secrets(path: &PathBuf) -> Result<HashMap<String, String>, CommandError> {
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

fn file_secret_key(secret_ref: &SecretRef) -> String {
    format!("{}:{}", secret_ref.service, secret_ref.account)
}

fn env_value(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        std::env::var(key)
            .ok()
            .filter(|value| !value.trim().is_empty())
    })
}

pub fn evaluate_guardrails(
    connection: &ConnectionProfile,
    environment: &EnvironmentProfile,
    resolved_environment: &ResolvedEnvironment,
    query_text: &str,
    safe_mode_enabled: bool,
) -> GuardrailDecision {
    let normalized = query_text.to_lowercase();
    let looks_write = [
        "insert", "update", "delete", "drop", "truncate", "alter", "create", "flushdb", "flushall",
        "set ",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword));

    if !resolved_environment.unresolved_keys.is_empty() {
        return GuardrailDecision {
            id: None,
            status: "block".into(),
            reasons: vec![
                "Unresolved environment variables must be fixed before execution.".into(),
            ],
            safe_mode_applied: safe_mode_enabled || environment.safe_mode,
            required_confirmation_text: None,
        };
    }

    if connection.read_only && looks_write {
        return GuardrailDecision {
            id: None,
            status: "block".into(),
            reasons: vec!["This connection is marked read-only.".into()],
            safe_mode_applied: safe_mode_enabled || environment.safe_mode,
            required_confirmation_text: None,
        };
    }

    if environment.requires_confirmation && (looks_write || environment.risk == "critical") {
        return GuardrailDecision {
            id: None,
            status: "confirm".into(),
            reasons: vec![format!(
                "{} requires confirmation for risky work.",
                environment.label
            )],
            safe_mode_applied: safe_mode_enabled || environment.safe_mode,
            required_confirmation_text: None,
        };
    }

    GuardrailDecision {
        id: None,
        status: "allow".into(),
        reasons: vec!["Guardrails cleared for the current query.".into()],
        safe_mode_applied: safe_mode_enabled || environment.safe_mode,
        required_confirmation_text: None,
    }
}

fn derive_legacy_key(passphrase: &str) -> [u8; 32] {
    let digest = Sha256::digest(passphrase.as_bytes());
    let mut key = [0_u8; 32];
    key.copy_from_slice(&digest[..32]);
    key
}

fn derive_export_key(passphrase: &str, salt: &[u8], iterations: u32) -> [u8; 32] {
    let mut key = [0_u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, iterations, &mut key);
    key
}

pub fn encrypt_export_payload(passphrase: &str, payload: &str) -> Result<String, CommandError> {
    let mut salt = [0_u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive_export_key(passphrase, &salt, EXPORT_KDF_ITERATIONS);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| CommandError::new("export-encryption", error.to_string()))?;
    let mut nonce_bytes = [0_u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, payload.as_bytes())
        .map_err(|error| CommandError::new("export-encryption", error.to_string()))?;

    Ok(BASE64.encode(
        json!({
            "kdf": EXPORT_KDF,
            "iterations": EXPORT_KDF_ITERATIONS,
            "salt": BASE64.encode(salt),
            "nonce": BASE64.encode(nonce_bytes),
            "ciphertext": BASE64.encode(ciphertext),
        })
        .to_string(),
    ))
}

pub fn decrypt_export_payload(
    passphrase: &str,
    encrypted_payload: &str,
) -> Result<String, CommandError> {
    let decoded = BASE64
        .decode(encrypted_payload)
        .map_err(|error| CommandError::new("export-decryption", error.to_string()))?;
    let package: serde_json::Value = serde_json::from_slice(&decoded)?;
    let nonce_b64 = package["nonce"]
        .as_str()
        .ok_or_else(|| CommandError::new("export-decryption", "Missing nonce."))?;
    let ciphertext_b64 = package["ciphertext"]
        .as_str()
        .ok_or_else(|| CommandError::new("export-decryption", "Missing ciphertext."))?;
    let nonce_bytes = BASE64
        .decode(nonce_b64)
        .map_err(|error| CommandError::new("export-decryption", error.to_string()))?;
    let ciphertext = BASE64
        .decode(ciphertext_b64)
        .map_err(|error| CommandError::new("export-decryption", error.to_string()))?;
    let key = if package["kdf"].as_str() == Some(EXPORT_KDF) {
        let salt_b64 = package["salt"]
            .as_str()
            .ok_or_else(|| CommandError::new("export-decryption", "Missing salt."))?;
        let iterations = package["iterations"]
            .as_u64()
            .and_then(|value| u32::try_from(value).ok())
            .filter(|value| *value > 0)
            .ok_or_else(|| CommandError::new("export-decryption", "Invalid KDF iterations."))?;
        let salt = BASE64
            .decode(salt_b64)
            .map_err(|error| CommandError::new("export-decryption", error.to_string()))?;
        derive_export_key(passphrase, &salt, iterations)
    } else {
        derive_legacy_key(passphrase)
    };
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| CommandError::new("export-decryption", error.to_string()))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|error| CommandError::new("export-decryption", error.to_string()))?;

    String::from_utf8(plaintext)
        .map_err(|error| CommandError::new("export-decryption", error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_encryption_round_trips_with_kdf_metadata() {
        let encrypted = encrypt_export_payload("correct horse battery staple", "{\"ok\":true}")
            .expect("export should encrypt");
        let decoded = BASE64.decode(&encrypted).expect("bundle should be base64");
        let package: serde_json::Value =
            serde_json::from_slice(&decoded).expect("bundle should contain json metadata");

        assert_eq!(package["kdf"].as_str(), Some(EXPORT_KDF));
        assert_eq!(
            package["iterations"].as_u64(),
            Some(EXPORT_KDF_ITERATIONS as u64)
        );
        assert!(package["salt"].as_str().is_some());

        let decrypted = decrypt_export_payload("correct horse battery staple", &encrypted)
            .expect("export should decrypt");
        assert_eq!(decrypted, "{\"ok\":true}");
    }

    #[test]
    fn export_decryption_rejects_wrong_passphrase() {
        let encrypted =
            encrypt_export_payload("right", "{\"ok\":true}").expect("export should encrypt");

        assert!(decrypt_export_payload("wrong", &encrypted).is_err());
    }

    #[test]
    fn export_decryption_accepts_legacy_sha256_bundles() {
        let key = derive_legacy_key("legacy");
        let cipher = Aes256Gcm::new_from_slice(&key).expect("legacy key should initialize");
        let nonce_bytes = [7_u8; 12];
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, b"{\"legacy\":true}".as_slice())
            .expect("legacy payload should encrypt");
        let encrypted = BASE64.encode(
            json!({
                "nonce": BASE64.encode(nonce_bytes),
                "ciphertext": BASE64.encode(ciphertext),
            })
            .to_string(),
        );

        let decrypted =
            decrypt_export_payload("legacy", &encrypted).expect("legacy bundle should decrypt");
        assert_eq!(decrypted, "{\"legacy\":true}");
    }
}
