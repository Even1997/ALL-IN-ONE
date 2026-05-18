use super::context_store::ensure_agent_shell_dir;
use super::types::{AgentShellSettingsRecord, UpdateAgentShellSettingsInput};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentShellSettingsStoreData {
    #[serde(default = "default_mode")]
    mode: String,
}

fn default_mode() -> String {
    "classic".to_string()
}

impl Default for AgentShellSettingsStoreData {
    fn default() -> Self {
        Self { mode: default_mode() }
    }
}

impl AgentShellSettingsStoreData {
    fn into_record(self) -> AgentShellSettingsRecord {
        AgentShellSettingsRecord { mode: self.mode }
    }
}

fn settings_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_shell_dir(app_data_dir)?.join("settings.json"))
}

fn save_settings_store(
    app_data_dir: &Path,
    store: &AgentShellSettingsStoreData,
) -> Result<(), String> {
    let store_path = settings_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize agent shell settings store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write agent shell settings store: {}", error))
}

fn load_settings_store(app_data_dir: &Path) -> Result<AgentShellSettingsStoreData, String> {
    let store_path = settings_store_path(app_data_dir)?;
    if !store_path.exists() {
        let store = AgentShellSettingsStoreData::default();
        save_settings_store(app_data_dir, &store)?;
        return Ok(store);
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read agent shell settings store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse agent shell settings store: {}", error))
}

pub fn get_settings(app_data_dir: &Path) -> Result<AgentShellSettingsRecord, String> {
    Ok(load_settings_store(app_data_dir)?.into_record())
}

pub fn update_settings(
    app_data_dir: &Path,
    input: UpdateAgentShellSettingsInput,
) -> Result<AgentShellSettingsRecord, String> {
    let mut store = load_settings_store(app_data_dir)?;

    if let Some(mode) = input.mode {
        store.mode = mode;
    }

    save_settings_store(app_data_dir, &store)?;
    Ok(store.into_record())
}

#[cfg(test)]
mod tests {
    use super::{get_settings, update_settings};
    use crate::agent_shell::types::UpdateAgentShellSettingsInput;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_app_data_dir(label: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        dir.push(format!("goodnight-agent-shell-{}-{}", label, nonce));
        fs::create_dir_all(&dir).expect("create temp app data dir");
        dir
    }

    #[test]
    fn get_settings_uses_defaults_when_store_is_missing() {
        let app_data_dir = create_temp_app_data_dir("defaults");

        let settings = get_settings(&app_data_dir).expect("load settings");

        assert_eq!(settings.mode, "classic");

        fs::remove_dir_all(app_data_dir).ok();
    }

    #[test]
    fn update_settings_persists_mode() {
        let app_data_dir = create_temp_app_data_dir("update");

        let updated = update_settings(
            &app_data_dir,
            UpdateAgentShellSettingsInput {
                mode: Some("claude".into()),
            },
        )
        .expect("update settings");

        assert_eq!(updated.mode, "claude");

        let reloaded = get_settings(&app_data_dir).expect("reload settings");
        assert_eq!(reloaded.mode, "claude");

        fs::remove_dir_all(app_data_dir).ok();
    }
}
