use super::context_store::ensure_agent_runtime_dir;
use super::types::RuntimeReplayEventRecord;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayStoreData {
    #[serde(default)]
    events: Vec<RuntimeReplayEventRecord>,
}

fn replay_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("runtime-replay.json"))
}

fn load_replay_store(app_data_dir: &Path) -> Result<ReplayStoreData, String> {
    let store_path = replay_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(ReplayStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read runtime replay store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse runtime replay store: {}", error))
}

fn save_replay_store(app_data_dir: &Path, store: &ReplayStoreData) -> Result<(), String> {
    let store_path = replay_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize runtime replay store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write runtime replay store: {}", error))
}

pub fn append_event(
    app_data_dir: &Path,
    event: RuntimeReplayEventRecord,
) -> Result<RuntimeReplayEventRecord, String> {
    let mut store = load_replay_store(app_data_dir)?;
    store.events.push(event.clone());
    save_replay_store(app_data_dir, &store)?;
    Ok(event)
}

pub fn list_events(
    app_data_dir: &Path,
    thread_id: &str,
) -> Result<Vec<RuntimeReplayEventRecord>, String> {
    let mut events = load_replay_store(app_data_dir)?
        .events
        .into_iter()
        .filter(|event| event.thread_id == thread_id)
        .collect::<Vec<_>>();
    events.sort_by(|left, right| left.created_at.cmp(&right.created_at));
    Ok(events)
}
