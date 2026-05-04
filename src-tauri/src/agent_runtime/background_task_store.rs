use super::context_store::ensure_agent_runtime_dir;
use super::types::AgentBackgroundTaskRecord;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundTaskStoreData {
    tasks: Vec<AgentBackgroundTaskRecord>,
}

fn background_task_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("background-tasks.json"))
}

fn load_background_task_store(app_data_dir: &Path) -> Result<BackgroundTaskStoreData, String> {
    let store_path = background_task_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(BackgroundTaskStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read background task store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse background task store: {}", error))
}

fn save_background_task_store(
    app_data_dir: &Path,
    store: &BackgroundTaskStoreData,
) -> Result<(), String> {
    let store_path = background_task_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize background task store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write background task store: {}", error))
}

pub fn upsert_task(
    app_data_dir: &Path,
    task: AgentBackgroundTaskRecord,
) -> Result<AgentBackgroundTaskRecord, String> {
    let mut store = load_background_task_store(app_data_dir)?;
    store.tasks.retain(|existing| existing.id != task.id);
    store.tasks.push(task.clone());
    save_background_task_store(app_data_dir, &store)?;
    Ok(task)
}

pub fn list_tasks(
    app_data_dir: &Path,
    thread_id: &str,
) -> Result<Vec<AgentBackgroundTaskRecord>, String> {
    let mut tasks = load_background_task_store(app_data_dir)?
        .tasks
        .into_iter()
        .filter(|task| task.thread_id == thread_id)
        .collect::<Vec<_>>();

    tasks.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(tasks)
}
