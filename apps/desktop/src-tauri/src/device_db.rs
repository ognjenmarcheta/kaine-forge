//! Device databases for synced rows (ADR 0020): WebKitGTK has no OPFS.
//!
//! TanStack DB's Tauri driver runs a transaction as separate statements, so
//! every statement of a database must reach the same connection. Each database
//! here has exactly one; tauri-plugin-sql pools several and splits them.

use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};

use rusqlite::hooks::{AuthAction, Authorization};
use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Serialize;
use serde_json::{Map, Number, Value as Json};

type Result<T> = std::result::Result<T, String>;

/// The open device databases, by file name, in one directory.
pub struct DeviceDatabases {
  dir: PathBuf,
  open: Mutex<HashMap<String, Connection>>,
}

/// The outcome of a statement, in the shape TanStack's driver reads.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
  rows_affected: u64,
  last_insert_id: i64,
}

fn message(error: impl std::fmt::Display) -> String {
  error.to_string()
}

/// A plain file name in the directory: the name comes from the webview.
fn checked(name: &str) -> Result<&str> {
  let plain = name.len() <= 128
    && name.ends_with(".db")
    && !name.starts_with('.')
    && name
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte));
  if plain {
    Ok(name)
  } else {
    Err(format!("invalid device database name: {name}"))
  }
}

fn to_sql(value: &Json) -> Value {
  match value {
    Json::Null => Value::Null,
    Json::Bool(flag) => Value::Integer(i64::from(*flag)),
    Json::Number(number) => number.as_i64().map_or_else(
      || Value::Real(number.as_f64().unwrap_or(f64::NAN)),
      Value::Integer,
    ),
    Json::String(text) => Value::Text(text.clone()),
    other => Value::Text(other.to_string()),
  }
}

fn to_json(value: ValueRef<'_>) -> Json {
  match value {
    ValueRef::Null => Json::Null,
    ValueRef::Integer(number) => Json::from(number),
    ValueRef::Real(number) => Number::from_f64(number).map_or(Json::Null, Json::Number),
    ValueRef::Text(text) => Json::String(String::from_utf8_lossy(text).into_owned()),
    ValueRef::Blob(bytes) => Json::from(bytes.to_vec()),
  }
}

impl DeviceDatabases {
  pub fn new(dir: PathBuf) -> Self {
    Self {
      dir,
      open: Mutex::new(HashMap::new()),
    }
  }

  fn lock(&self) -> MutexGuard<'_, HashMap<String, Connection>> {
    self.open.lock().unwrap_or_else(PoisonError::into_inner)
  }

  fn with<T>(&self, name: &str, run: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T> {
    let open = self.lock();
    let connection = open
      .get(name)
      .ok_or_else(|| format!("device database not open: {name}"))?;
    run(connection).map_err(message)
  }

  /// Opens a database for a page. The connection outlives a page reload, so
  /// a transaction the earlier page never finished is rolled back here.
  pub fn open(&self, name: &str) -> Result<()> {
    let name = checked(name)?;
    let mut open = self.lock();
    if let Some(connection) = open.get(name) {
      if !connection.is_autocommit() {
        connection.execute_batch("ROLLBACK").map_err(message)?;
      }
      return Ok(());
    }
    fs::create_dir_all(&self.dir).map_err(message)?;
    let mut connection = Connection::open(self.dir.join(name)).map_err(message)?;
    // The SQL comes from the webview: no statement may reach a file outside the
    // directory. SQLite reports both ATTACH and VACUUM INTO as an attach.
    connection
      .authorizer(Some(|context: rusqlite::hooks::AuthContext<'_>| {
        if matches!(context.action, AuthAction::Attach { .. }) {
          Authorization::Deny
        } else {
          Authorization::Allow
        }
      }))
      .map_err(message)?;
    open.insert(name.to_owned(), connection);
    Ok(())
  }

  pub fn execute(&self, name: &str, sql: &str, values: &[Json]) -> Result<QueryResult> {
    self.with(name, |connection| {
      if values.is_empty() {
        // A schema step can hold several statements.
        connection.execute_batch(sql)?;
      } else {
        let mut statement = connection.prepare(sql)?;
        let mut rows = statement.query(params_from_iter(values.iter().map(to_sql)))?;
        while rows.next()?.is_some() {}
      }
      Ok(QueryResult {
        rows_affected: connection.changes(),
        last_insert_id: connection.last_insert_rowid(),
      })
    })
  }

  pub fn select(&self, name: &str, sql: &str, values: &[Json]) -> Result<Vec<Map<String, Json>>> {
    self.with(name, |connection| {
      let mut statement = connection.prepare(sql)?;
      let columns: Vec<String> = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect();
      let mut rows = statement.query(params_from_iter(values.iter().map(to_sql)))?;
      let mut selected = Vec::new();
      while let Some(row) = rows.next()? {
        let mut object = Map::new();
        for (index, column) in columns.iter().enumerate() {
          object.insert(column.clone(), to_json(row.get_ref(index)?));
        }
        selected.push(object);
      }
      Ok(selected)
    })
  }

  /// The names of the databases in the directory, open or not.
  pub fn list(&self) -> Result<Vec<String>> {
    let entries = match fs::read_dir(&self.dir) {
      Ok(entries) => entries,
      Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
      Err(error) => return Err(message(error)),
    };
    let mut names: Vec<String> = entries
      .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
      .filter(|name| checked(name).is_ok())
      .collect();
    names.sort();
    Ok(names)
  }

  /// Closes a database, which rolls back an unfinished transaction, and deletes its files.
  pub fn delete(&self, name: &str) -> Result<()> {
    let name = checked(name)?;
    let mut open = self.lock();
    open.remove(name);
    for suffix in ["", "-wal", "-shm", "-journal"] {
      match fs::remove_file(self.dir.join(format!("{name}{suffix}"))) {
        Err(error) if error.kind() != ErrorKind::NotFound => return Err(message(error)),
        _ => {}
      }
    }
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  /// The device databases of one test, in a directory removed when the test ends.
  struct Scratch(DeviceDatabases);

  impl std::ops::Deref for Scratch {
    type Target = DeviceDatabases;

    fn deref(&self) -> &DeviceDatabases {
      &self.0
    }
  }

  impl Drop for Scratch {
    fn drop(&mut self) {
      // Closed first: an open file cannot be removed on every OS.
      self.0.lock().clear();
      let _ = fs::remove_dir_all(&self.0.dir);
    }
  }

  fn databases(test: &str) -> Scratch {
    let dir = std::env::temp_dir().join(format!("kaine-device-db-{}-{test}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    Scratch(DeviceDatabases::new(dir))
  }

  fn count(databases: &DeviceDatabases, name: &str) -> Json {
    databases
      .select(name, "SELECT count(*) AS n FROM t", &[])
      .unwrap()[0]["n"]
      .clone()
  }

  #[test]
  fn commits_a_transaction_sent_as_separate_statements() {
    let databases = databases("transaction");
    databases.open("a.db").unwrap();
    databases
      .execute("a.db", "CREATE TABLE t (x)", &[])
      .unwrap();

    databases.execute("a.db", "BEGIN IMMEDIATE", &[]).unwrap();
    databases
      .execute("a.db", "INSERT INTO t VALUES ($1)", &[json!(1)])
      .unwrap();
    databases.execute("a.db", "COMMIT", &[]).unwrap();

    assert_eq!(count(&databases, "a.db"), json!(1));
  }

  #[test]
  fn opening_again_rolls_back_what_a_reloaded_page_left_unfinished() {
    let databases = databases("reload");
    databases.open("a.db").unwrap();
    databases
      .execute("a.db", "CREATE TABLE t (x)", &[])
      .unwrap();
    databases.execute("a.db", "BEGIN IMMEDIATE", &[]).unwrap();
    databases
      .execute("a.db", "INSERT INTO t VALUES ($1)", &[json!(1)])
      .unwrap();

    databases.open("a.db").unwrap();

    assert_eq!(count(&databases, "a.db"), json!(0));
    databases.execute("a.db", "BEGIN IMMEDIATE", &[]).unwrap();
  }

  #[test]
  fn selects_rows_as_objects_keyed_by_column() {
    let databases = databases("select");
    databases.open("a.db").unwrap();
    databases
      .execute("a.db", "CREATE TABLE t (i, r, s, n)", &[])
      .unwrap();
    databases
      .execute(
        "a.db",
        "INSERT INTO t VALUES ($1, $2, $3, $4)",
        &[json!(7), json!(1.5), json!("text"), Json::Null],
      )
      .unwrap();

    let rows = databases
      .select("a.db", "SELECT * FROM t WHERE i = $1", &[json!(7)])
      .unwrap();

    assert_eq!(
      Json::Array(rows.into_iter().map(Json::Object).collect()),
      json!([{ "i": 7, "r": 1.5, "s": "text", "n": null }])
    );
  }

  #[test]
  fn refuses_a_name_outside_its_directory() {
    let databases = databases("names");
    for name in ["../a.db", "dir/a.db", ".a.db", "a.sqlite"] {
      assert!(databases.open(name).is_err(), "{name}");
    }
  }

  #[test]
  fn refuses_sql_that_writes_a_file_outside_its_directory() {
    let databases = databases("attach");
    databases.open("a.db").unwrap();
    let outside =
      std::env::temp_dir().join(format!("kaine-device-db-{}-outside.db", std::process::id()));
    let _ = fs::remove_file(&outside);
    let path = outside.display().to_string().replace('\'', "''");

    for sql in [
      format!("ATTACH DATABASE '{path}' AS outside"),
      format!("VACUUM INTO '{path}'"),
    ] {
      assert!(databases.execute("a.db", &sql, &[]).is_err(), "{sql}");
    }
    assert!(!outside.exists());
  }

  #[test]
  fn deletes_a_database_and_closes_it() {
    let databases = databases("delete");
    for name in ["a.db", "b.db"] {
      databases.open(name).unwrap();
      databases.execute(name, "CREATE TABLE t (x)", &[]).unwrap();
    }

    databases.delete("a.db").unwrap();

    assert_eq!(databases.list().unwrap(), vec!["b.db".to_owned()]);
    assert!(databases.execute("a.db", "SELECT 1", &[]).is_err());
  }
}
