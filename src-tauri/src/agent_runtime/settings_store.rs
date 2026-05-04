use super::approval_store;
use super::context_store::ensure_agent_runtime_dir;
use super::types::{RuntimeSettingsRecord, UpdateRuntimeSettingsInput};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSettingsStoreData {
    #[serde(default = "default_sandbox_policy")]
    sandbox_policy: String,
    #[serde(default = "default_permission_mode")]
    permission_mode: String,
    #[serde(default)]
    auto_resume_on_launch: bool,
    #[serde(default = "default_persist_resume_drafts")]
    persist_resume_drafts: bool,
}

fn default_sandbox_policy() -> String {
    "ask".to_string()
}

fn default_persist_resume_drafts() -> bool {
    true
}

fn default_permission_mode() -> String {
    "ask".to_string()
}

impl Default for RuntimeSettingsStoreData {
    fn default() -> Self {
        Self {
            sandbox_policy: default_sandbox_policy(),
            permission_mode: default_permission_mode(),
            auto_resume_on_launch: false,
            persist_resume_drafts: default_persist_resume_drafts(),
        }
    }
}

impl RuntimeSettingsStoreData {
    fn into_record(self) -> RuntimeSettingsRecord {
        RuntimeSettingsRecord {
            sandbox_policy: self.sandbox_policy,
            permission_mode: self.permission_mode,
            auto_resume_on_launch: self.auto_resume_on_launch,
            persist_resume_drafts: self.persist_resume_drafts,
        }
    }
}

fn settings_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("runtime-settings.json"))
}

fn save_settings_store(app_data_dir: &Path, store: &RuntimeSettingsStoreData) -> Result<(), String> {
    let store_path = settings_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize runtime settings store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write runtime settings store: {}", error))
}

fn build_default_settings_store(app_data_dir: &Path) -> Result<RuntimeSettingsStoreData, String> {
    let mut store = RuntimeSettingsStoreData::default();

    if let Some(legacy_sandbox_policy) = approval_store::get_legacy_sandbox_policy(app_data_dir)? {
        store.sandbox_policy = legacy_sandbox_policy;
    }
    store.permission_mode = match store.sandbox_policy.as_str() {
        "deny" => "plan".to_string(),
        "allow" => "auto".to_string(),
        _ => "ask".to_string(),
    };

    Ok(store)
}

fn load_settings_store(app_data_dir: &Path) -> Result<RuntimeSettingsStoreData, String> {
    let store_path = settings_store_path(app_data_dir)?;
    if !store_path.exists() {
        let store = build_default_settings_store(app_data_dir)?;
        save_settings_store(app_data_dir, &store)?;
        return Ok(store);
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read runtime settings store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse runtime settings store: {}", error))
}

pub fn get_settings(app_data_dir: &Path) -> Result<RuntimeSettingsRecord, String> {
    Ok(load_settings_store(app_data_dir)?.into_record())
}

pub fn update_settings(
    app_data_dir: &Path,
    input: UpdateRuntimeSettingsInput,
) -> Result<RuntimeSettingsRecord, String> {
    let mut store = load_settings_store(app_data_dir)?;

    if let Some(sandbox_policy) = input.sandbox_policy {
        store.sandbox_policy = sandbox_policy;
    }
    if let Some(permission_mode) = input.permission_mode {
        store.permission_mode = permission_mode;
    }
    if let Some(auto_resume_on_launch) = input.auto_resume_on_launch {
        store.auto_resume_on_launch = auto_resume_on_launch;
    }
    if let Some(persist_resume_drafts) = input.persist_resume_drafts {
        store.persist_resume_drafts = persist_resume_drafts;
    }

    save_settings_store(app_data_dir, &store)?;
    Ok(store.into_record())
}

#[cfg(test)]
mod tests {
    use super::{get_settings, update_settings};
    use crate::agent_runtime::context_store::ensure_agent_runtime_dir;
    use crate::agent_runtime::types::UpdateRuntimeSettingsInput;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_app_data_dir(label: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        dir.push(format!("goodnight-agent-runtime-{}-{}", label, nonce));
        fs::create_dir_all(&dir).expect("create temp app data dir");
        dir
    }

    #[test]
    fn get_settings_uses_defaults_when_store_is_missing() {
        let app_data_dir = create_temp_app_data_dir("defaults");

        let settings = get_settings(&app_data_dir).expect("load runtime settings");

        assert_eq!(settings.sandbox_policy, "ask");
        assert_eq!(settings.permission_mode, "ask");
        assert!(!settings.auto_resume_on_launch);
        assert!(settings.persist_resume_drafts);

        fs::remove_dir_all(app_data_dir).ok();
    }

    #[test]
    fn get_settings_migrates_legacy_sandbox_policy() {
        let app_data_dir = create_temp_app_data_dir("legacy");
        let runtime_dir = ensure_agent_runtime_dir(&app_data_dir).expect("runtime dir");
        let legacy_approvals_path = runtime_dir.join("approvals.json");
        fs::write(
            legacy_approvals_path,
            r#"{"sandboxPolicy":"deny","approvals":[]}"#,
        )
        .expect("write legacy approvals store");

        let settings = get_settings(&app_data_dir).expect("load migrated settings");

        assert_eq!(settings.sandbox_policy, "deny");
        assert_eq!(settings.permission_mode, "plan");
        assert!(!settings.auto_resume_on_launch);
        assert!(settings.persist_resume_drafts);

        fs::remove_dir_all(app_data_dir).ok();
    }

    #[test]
    fn update_settings_persists_runtime_preferences() {
        let app_data_dir = create_temp_app_data_dir("update");

        let updated = update_settings(
            &app_data_dir,
            UpdateRuntimeSettingsInput {
                sandbox_policy: Some("allow".to_string()),
                permission_mode: Some("bypass".to_string()),
                auto_resume_on_launch: Some(true),
                persist_resume_drafts: Some(false),
            },
        )
        .expect("update runtime settings");

        assert_eq!(updated.sandbox_policy, "allow");
        assert_eq!(updated.permission_mode, "bypass");
        assert!(updated.auto_resume_on_launch);
        assert!(!updated.persist_resume_drafts);

        let reloaded = get_settings(&app_data_dir).expect("reload runtime settings");
        assert_eq!(reloaded.sandbox_policy, "allow");
        assert_eq!(reloaded.permission_mode, "bypass");
        assert!(reloaded.auto_resume_on_launch);
        assert!(!reloaded.persist_resume_drafts);

        fs::remove_dir_all(app_data_dir).ok();
    }
}
