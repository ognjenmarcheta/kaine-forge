//! Where the bearer session token lives between launches: the OS credential
//! store, or memory when the store is unavailable (tests, a Linux session
//! without a secret service).

use std::sync::Mutex;

use anyhow::Result;

pub trait TokenStore: Send + Sync + 'static {
    fn get(&self) -> Result<Option<String>>;
    fn set(&self, token: &str) -> Result<()>;
    fn clear(&self) -> Result<()>;
}

/// The OS keyring: Keychain on macOS, Credential Manager on Windows, the
/// secret service on Linux. One entry per API origin.
pub struct KeyringStore {
    service: String,
    user: String,
}

impl KeyringStore {
    pub fn new(api_url: &str) -> Self {
        Self {
            service: env!("CARGO_PKG_NAME").to_owned(),
            user: api_url.to_owned(),
        }
    }

    fn entry(&self) -> Result<keyring::Entry> {
        Ok(keyring::Entry::new(&self.service, &self.user)?)
    }
}

impl TokenStore for KeyringStore {
    fn get(&self) -> Result<Option<String>> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    fn set(&self, token: &str) -> Result<()> {
        Ok(self.entry()?.set_password(token)?)
    }

    fn clear(&self) -> Result<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
}

/// A token that lives as long as the process.
#[derive(Default)]
pub struct MemoryStore(Mutex<Option<String>>);

impl MemoryStore {
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<String>> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

impl TokenStore for MemoryStore {
    fn get(&self) -> Result<Option<String>> {
        Ok(self.lock().clone())
    }

    fn set(&self, token: &str) -> Result<()> {
        *self.lock() = Some(token.to_owned());
        Ok(())
    }

    fn clear(&self) -> Result<()> {
        *self.lock() = None;
        Ok(())
    }
}
