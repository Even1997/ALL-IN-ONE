use super::context_store::ensure_agent_runtime_dir;
use super::types::{AgentThreadRecord, AgentTimelineEvent};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThreadStoreData {
    threads: Vec<AgentThreadRecord>,
    timeline: Vec<AgentTimelineEvent>,
}

fn thread_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("threads.json"))
}

fn load_thread_store(app_data_dir: &Path) -> Result<ThreadStoreData, String> {
    let store_path = thread_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(ThreadStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read agent thread store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse agent thread store: {}", error))
}

fn save_thread_store(app_data_dir: &Path, store: &ThreadStoreData) -> Result<(), String> {
    let store_path = thread_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize agent thread store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write agent thread store: {}", error))
}

pub fn create_thread(
    app_data_dir: &Path,
    thread: AgentThreadRecord,
) -> Result<AgentThreadRecord, String> {
    let mut store = load_thread_store(app_data_dir)?;
    store.threads.retain(|existing| existing.id != thread.id);
    store.threads.push(thread.clone());
    save_thread_store(app_data_dir, &store)?;
    Ok(thread)
}

pub fn list_threads(
    app_data_dir: &Path,
    project_id: &str,
) -> Result<Vec<AgentThreadRecord>, String> {
    let mut threads = load_thread_store(app_data_dir)?
        .threads
        .into_iter()
        .filter(|thread| thread.project_id == project_id)
        .collect::<Vec<_>>();

    threads.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(threads)
}

pub fn append_timeline_event(
    app_data_dir: &Path,
    event: AgentTimelineEvent,
) -> Result<AgentTimelineEvent, String> {
    let mut store = load_thread_store(app_data_dir)?;
    let thread = store
        .threads
        .iter_mut()
        .find(|thread| thread.id == event.thread_id)
        .ok_or_else(|| format!("Agent thread not found: {}", event.thread_id))?;

    thread.updated_at = event.created_at;

    store.timeline.push(event.clone());
    save_thread_store(app_data_dir, &store)?;
    Ok(event)
}

#[cfg(test)]
mod tests {
    use super::{append_timeline_event, create_thread, list_threads};
    use crate::agent_runtime::types::{AgentThreadRecord, AgentTimelineEvent};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let unique = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("goodnight-{}-{}-{}", prefix, timestamp, unique));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    #[test]
    fn append_timeline_event_rejects_unknown_thread() {
        let app_data_dir = make_temp_dir("thread-store-missing-thread");
        let result = append_timeline_event(
            &app_data_dir,
            AgentTimelineEvent {
                id: "event-1".into(),
                thread_id: "missing-thread".into(),
                turn_id: "turn-1".into(),
                kind: "message".into(),
                payload: "payload".into(),
                created_at: 42,
            },
        );

        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("Agent thread not found"),
            "expected missing thread error"
        );

        fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn list_threads_returns_latest_first_after_persistence() {
        let app_data_dir = make_temp_dir("thread-store-ordering");
        let older = AgentThreadRecord {
            id: "thread-older".into(),
            project_id: "project-1".into(),
            title: "Older".into(),
            provider_id: "codex".into(),
            created_at: 10,
            updated_at: 10,
        };
        let newer = AgentThreadRecord {
            id: "thread-newer".into(),
            project_id: "project-1".into(),
            title: "Newer".into(),
            provider_id: "claude".into(),
            created_at: 20,
            updated_at: 20,
        };

        create_thread(&app_data_dir, older).expect("save older thread");
        create_thread(&app_data_dir, newer).expect("save newer thread");

        let threads = list_threads(&app_data_dir, "project-1").expect("list threads");
        let thread_ids = threads
            .iter()
            .map(|thread| thread.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(thread_ids, vec!["thread-newer", "thread-older"]);

        fs::remove_dir_all(&app_data_dir).ok();
    }
}
