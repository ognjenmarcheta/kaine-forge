mod device_db;

use device_db::{DeviceDatabases, QueryResult};
use serde_json::{Map, Value};
use tauri::{Manager, State};

#[tauri::command]
async fn device_db_open(databases: State<'_, DeviceDatabases>, name: String) -> Result<(), String> {
  databases.open(&name)
}

#[tauri::command]
async fn device_db_execute(
  databases: State<'_, DeviceDatabases>,
  name: String,
  sql: String,
  values: Vec<Value>,
) -> Result<QueryResult, String> {
  databases.execute(&name, &sql, &values)
}

#[tauri::command]
async fn device_db_select(
  databases: State<'_, DeviceDatabases>,
  name: String,
  sql: String,
  values: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
  databases.select(&name, &sql, &values)
}

#[tauri::command]
async fn device_db_list(databases: State<'_, DeviceDatabases>) -> Result<Vec<String>, String> {
  databases.list()
}

#[tauri::command]
async fn device_db_delete(
  databases: State<'_, DeviceDatabases>,
  name: String,
) -> Result<(), String> {
  databases.delete(&name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      app.manage(DeviceDatabases::new(
        app.path().app_data_dir()?.join("device-databases"),
      ));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      device_db_open,
      device_db_execute,
      device_db_select,
      device_db_list,
      device_db_delete
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
