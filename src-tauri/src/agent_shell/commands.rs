use super::session_store;
use super::settings_store;
use super::types::{
    AgentShellSessionRecord, AgentShellSettingsRecord, CreateAgentShellSessionInput,
    UpdateAgentShellSettingsInput,
};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

static RECORD_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn resolve_app_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {}", error))?;

    Ok(app_data_dir)
}

fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn build_record_id(prefix: &str) -> String {
    let sequence = RECORD_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", prefix, current_time_millis(), sequence)
}

#[tauri::command]
pub fn create_agent_shell_session(
    app_handle: tauri::AppHandle,
    input: CreateAgentShellSessionInput,
) -> Result<AgentShellSessionRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    let now = current_time_millis();
    let session = AgentShellSessionRecord {
        id: build_record_id("shell-session"),
        project_id: input.project_id,
        provider_id: input.provider_id,
        title: input.title,
        working_directory: input.working_directory,
        created_at: now,
        updated_at: now,
    };

    session_store::create_session(&app_data_dir, session)
}

#[tauri::command]
pub fn list_agent_shell_sessions(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<AgentShellSessionRecord>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    session_store::list_sessions(&app_data_dir, &project_id)
}

#[tauri::command]
pub fn get_agent_shell_settings(
    app_handle: tauri::AppHandle,
) -> Result<AgentShellSettingsRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    settings_store::get_settings(&app_data_dir)
}

#[tauri::command]
pub fn update_agent_shell_settings(
    app_handle: tauri::AppHandle,
    input: UpdateAgentShellSettingsInput,
) -> Result<AgentShellSettingsRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    settings_store::update_settings(&app_data_dir, input)
}

#[cfg(test)]
mod tests {
    use super::build_record_id;
    use std::collections::HashSet;

    #[test]
    fn build_record_id_stays_unique_across_fast_calls() {
        let ids = (0..64)
            .map(|_| build_record_id("shell-session"))
            .collect::<Vec<_>>();
        let unique_ids = ids.iter().cloned().collect::<HashSet<_>>();

        assert_eq!(ids.len(), unique_ids.len());
    }
}
