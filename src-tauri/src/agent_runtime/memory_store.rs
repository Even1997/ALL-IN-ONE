use super::context_store::ensure_agent_runtime_dir;
use super::types::ProjectMemoryEntry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoryStoreData {
    entries: Vec<ProjectMemoryEntry>,
}

fn memory_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("project-memory.json"))
}

fn load_memory_store(app_data_dir: &Path) -> Result<MemoryStoreData, String> {
    let store_path = memory_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(MemoryStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read project memory store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse project memory store: {}", error))
}

fn save_memory_store(app_data_dir: &Path, store: &MemoryStoreData) -> Result<(), String> {
    let store_path = memory_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize project memory store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write project memory store: {}", error))
}

pub fn save_entry(
    app_data_dir: &Path,
    entry: ProjectMemoryEntry,
) -> Result<ProjectMemoryEntry, String> {
    let mut store = load_memory_store(app_data_dir)?;
    if store
        .entries
        .iter()
        .any(|existing| existing.id == entry.id && existing.project_id != entry.project_id)
    {
        return Err(format!(
            "Project memory entry {} already belongs to another project",
            entry.id
        ));
    }

    store.entries.retain(|existing| existing.id != entry.id);
    store.entries.push(entry.clone());
    save_memory_store(app_data_dir, &store)?;
    Ok(entry)
}

pub fn list_entries(
    app_data_dir: &Path,
    project_id: &str,
) -> Result<Vec<ProjectMemoryEntry>, String> {
    let mut entries = load_memory_store(app_data_dir)?
        .entries
        .into_iter()
        .filter(|entry| entry.project_id == project_id)
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::{list_entries, save_entry};
    use crate::agent_runtime::types::ProjectMemoryEntry;
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
    fn list_entries_returns_latest_first_after_persistence() {
        let app_data_dir = make_temp_dir("memory-store-ordering");
        let older = ProjectMemoryEntry {
            id: "memory-older".into(),
            project_id: "project-1".into(),
            title: "Older".into(),
            summary: "Older summary".into(),
            content: "Older content".into(),
            updated_at: 10,
        };
        let newer = ProjectMemoryEntry {
            id: "memory-newer".into(),
            project_id: "project-1".into(),
            title: "Newer".into(),
            summary: "Newer summary".into(),
            content: "Newer content".into(),
            updated_at: 20,
        };

        save_entry(&app_data_dir, older).expect("save older memory entry");
        save_entry(&app_data_dir, newer).expect("save newer memory entry");

        let entries = list_entries(&app_data_dir, "project-1").expect("list memory entries");
        let entry_ids = entries
            .iter()
            .map(|entry| entry.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(entry_ids, vec!["memory-newer", "memory-older"]);

        fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn save_entry_rejects_cross_project_id_reuse() {
        let app_data_dir = make_temp_dir("memory-store-cross-project");
        let original = ProjectMemoryEntry {
            id: "shared-id".into(),
            project_id: "project-1".into(),
            title: "Original".into(),
            summary: "Original summary".into(),
            content: "Original content".into(),
            updated_at: 10,
        };
        let conflicting = ProjectMemoryEntry {
            id: "shared-id".into(),
            project_id: "project-2".into(),
            title: "Conflicting".into(),
            summary: "Conflicting summary".into(),
            content: "Conflicting content".into(),
            updated_at: 20,
        };

        save_entry(&app_data_dir, original).expect("save original entry");
        let result = save_entry(&app_data_dir, conflicting);

        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .contains("already belongs to another project"),
            "expected cross-project conflict"
        );

        fs::remove_dir_all(&app_data_dir).ok();
    }
}
