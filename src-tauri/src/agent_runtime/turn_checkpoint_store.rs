use super::context_store::ensure_agent_runtime_dir;
use super::types::{
    AgentTurnCheckpointDiffRecord, AgentTurnCheckpointFileRecord, AgentTurnCheckpointRecord,
    AgentTurnRewindResult, RewindAgentTurnInput, SaveAgentTurnCheckpointInput,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::cmp::max;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCheckpointFileChange {
    checkpoint_id: String,
    thread_id: String,
    run_id: String,
    path: String,
    change_type: String,
    before_content: Option<String>,
    after_content: Option<String>,
    diff: String,
    insertions: u64,
    deletions: u64,
    created_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnCheckpointStoreData {
    checkpoints: Vec<AgentTurnCheckpointRecord>,
    file_changes: Vec<StoredCheckpointFileChange>,
}

fn turn_checkpoint_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("turn-checkpoints.json"))
}

fn load_turn_checkpoint_store(app_data_dir: &Path) -> Result<TurnCheckpointStoreData, String> {
    let store_path = turn_checkpoint_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(TurnCheckpointStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read turn checkpoint store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse turn checkpoint store: {}", error))
}

fn save_turn_checkpoint_store(
    app_data_dir: &Path,
    store: &TurnCheckpointStoreData,
) -> Result<(), String> {
    let store_path = turn_checkpoint_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize turn checkpoint store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write turn checkpoint store: {}", error))
}

fn split_lines(content: &str) -> Vec<&str> {
    if content.is_empty() {
        Vec::new()
    } else {
        content.split('\n').collect()
    }
}

fn build_line_diff(before_content: Option<&str>, after_content: Option<&str>) -> (String, u64, u64) {
    match (before_content, after_content) {
        (None, None) => (String::new(), 0, 0),
        (None, Some(after)) => {
            let lines = split_lines(after);
            let diff = lines
                .iter()
                .map(|line| format!("+{}", line))
                .collect::<Vec<_>>()
                .join("\n");
            (diff, lines.len() as u64, 0)
        }
        (Some(before), None) => {
            let lines = split_lines(before);
            let diff = lines
                .iter()
                .map(|line| format!("-{}", line))
                .collect::<Vec<_>>()
                .join("\n");
            (diff, 0, lines.len() as u64)
        }
        (Some(before), Some(after)) => {
            let before_lines = split_lines(before);
            let after_lines = split_lines(after);
            let before_len = before_lines.len();
            let after_len = after_lines.len();
            let mut lcs = vec![vec![0usize; after_len + 1]; before_len + 1];

            for before_index in (0..before_len).rev() {
                for after_index in (0..after_len).rev() {
                    lcs[before_index][after_index] = if before_lines[before_index] == after_lines[after_index] {
                        lcs[before_index + 1][after_index + 1] + 1
                    } else {
                        max(lcs[before_index + 1][after_index], lcs[before_index][after_index + 1])
                    };
                }
            }

            let mut before_index = 0usize;
            let mut after_index = 0usize;
            let mut diff_lines: Vec<String> = Vec::new();
            let mut insertions = 0u64;
            let mut deletions = 0u64;

            while before_index < before_len && after_index < after_len {
                if before_lines[before_index] == after_lines[after_index] {
                    diff_lines.push(format!(" {}", before_lines[before_index]));
                    before_index += 1;
                    after_index += 1;
                    continue;
                }

                if lcs[before_index + 1][after_index] >= lcs[before_index][after_index + 1] {
                    diff_lines.push(format!("-{}", before_lines[before_index]));
                    deletions += 1;
                    before_index += 1;
                } else {
                    diff_lines.push(format!("+{}", after_lines[after_index]));
                    insertions += 1;
                    after_index += 1;
                }
            }

            while before_index < before_len {
                diff_lines.push(format!("-{}", before_lines[before_index]));
                deletions += 1;
                before_index += 1;
            }

            while after_index < after_len {
                diff_lines.push(format!("+{}", after_lines[after_index]));
                insertions += 1;
                after_index += 1;
            }

            (diff_lines.join("\n"), insertions, deletions)
        }
    }
}

pub fn save_turn_checkpoint(
    app_data_dir: &Path,
    checkpoint_id: String,
    input: SaveAgentTurnCheckpointInput,
    now: u64,
) -> Result<AgentTurnCheckpointRecord, String> {
    let mut store = load_turn_checkpoint_store(app_data_dir)?;

    let previous_file_changes = store.file_changes.clone();
    let existing_created_at = store
        .checkpoints
        .iter()
        .find(|checkpoint| checkpoint.thread_id == input.thread_id && checkpoint.run_id == input.run_id)
        .map(|checkpoint| checkpoint.created_at)
        .unwrap_or(now);

    store
        .checkpoints
        .retain(|checkpoint| !(checkpoint.thread_id == input.thread_id && checkpoint.run_id == input.run_id));
    store
        .file_changes
        .retain(|change| !(change.thread_id == input.thread_id && change.run_id == input.run_id));

    let mut files_changed: Vec<AgentTurnCheckpointFileRecord> = Vec::new();
    let mut file_changes: Vec<StoredCheckpointFileChange> = Vec::new();
    let mut total_insertions = 0u64;
    let mut total_deletions = 0u64;

    for file in input.files {
        let before_content = match file.before_content {
            Some(content) => Some(content),
            None => previous_file_changes
                .iter()
                .filter(|change| change.thread_id == input.thread_id && change.path == file.path)
                .max_by_key(|change| change.created_at)
                .and_then(|change| change.after_content.clone()),
        };
        let after_content = file.after_content;
        let change_type = match (before_content.as_ref(), after_content.as_ref()) {
            (None, Some(_)) => "created",
            (Some(_), None) => "deleted",
            _ => "updated",
        }
        .to_string();
        let (diff, insertions, deletions) =
            build_line_diff(before_content.as_deref(), after_content.as_deref());

        files_changed.push(AgentTurnCheckpointFileRecord {
            path: file.path.clone(),
            change_type: change_type.clone(),
            insertions,
            deletions,
        });
        file_changes.push(StoredCheckpointFileChange {
            checkpoint_id: checkpoint_id.clone(),
            thread_id: input.thread_id.clone(),
            run_id: input.run_id.clone(),
            path: file.path,
            change_type,
            before_content,
            after_content,
            diff,
            insertions,
            deletions,
            created_at: now,
        });
        total_insertions += insertions;
        total_deletions += deletions;
    }

    let record = AgentTurnCheckpointRecord {
        id: checkpoint_id,
        thread_id: input.thread_id,
        run_id: input.run_id,
        message_id: input.message_id,
        summary: input.summary,
        files_changed,
        insertions: total_insertions,
        deletions: total_deletions,
        created_at: existing_created_at,
        updated_at: now,
    };

    store.checkpoints.push(record.clone());
    store.file_changes.extend(file_changes);
    save_turn_checkpoint_store(app_data_dir, &store)?;

    Ok(record)
}

pub fn list_turn_checkpoints(
    app_data_dir: &Path,
    thread_id: &str,
) -> Result<Vec<AgentTurnCheckpointRecord>, String> {
    let mut checkpoints = load_turn_checkpoint_store(app_data_dir)?
        .checkpoints
        .into_iter()
        .filter(|checkpoint| checkpoint.thread_id == thread_id)
        .collect::<Vec<_>>();

    checkpoints.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(checkpoints)
}

pub fn get_turn_checkpoint_diff(
    app_data_dir: &Path,
    thread_id: &str,
    run_id: &str,
    path: &str,
) -> Result<AgentTurnCheckpointDiffRecord, String> {
    let change = load_turn_checkpoint_store(app_data_dir)?
        .file_changes
        .into_iter()
        .filter(|change| change.thread_id == thread_id && change.run_id == run_id && change.path == path)
        .max_by_key(|change| change.created_at)
        .ok_or_else(|| {
            format!(
                "Turn checkpoint diff not found for thread {}, run {}, path {}",
                thread_id, run_id, path
            )
        })?;

    Ok(AgentTurnCheckpointDiffRecord {
        checkpoint_id: change.checkpoint_id,
        thread_id: change.thread_id,
        run_id: change.run_id,
        path: change.path,
        change_type: change.change_type,
        before_content: change.before_content,
        after_content: change.after_content,
        diff: change.diff,
        insertions: change.insertions,
        deletions: change.deletions,
        created_at: change.created_at,
    })
}

fn resolve_checkpoint_path(project_root: &Path, stored_path: &str) -> PathBuf {
    let relative = stored_path.trim().trim_start_matches(['/', '\\']);
    project_root.join(relative)
}

fn write_reverted_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create parent directory for {}: {}", path.display(), error))?;
    }

    fs::write(path, content)
        .map_err(|error| format!("Failed to restore file {}: {}", path.display(), error))
}

fn remove_reverted_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Failed to remove directory {}: {}", path.display(), error))
    } else {
        fs::remove_file(path)
            .map_err(|error| format!("Failed to remove file {}: {}", path.display(), error))
    }
}

pub fn rewind_turn(
    app_data_dir: &Path,
    input: RewindAgentTurnInput,
    now: u64,
) -> Result<AgentTurnRewindResult, String> {
    let mut store = load_turn_checkpoint_store(app_data_dir)?;
    let target_checkpoint = store
        .checkpoints
        .iter()
        .find(|checkpoint| checkpoint.thread_id == input.thread_id && checkpoint.run_id == input.run_id)
        .cloned()
        .ok_or_else(|| {
            format!(
                "Turn checkpoint not found for thread {}, run {}",
                input.thread_id, input.run_id
            )
        })?;

    let rewind_checkpoints = store
        .checkpoints
        .iter()
        .filter(|checkpoint| {
            checkpoint.thread_id == input.thread_id && checkpoint.created_at >= target_checkpoint.created_at
        })
        .cloned()
        .collect::<Vec<_>>();

    let rewind_run_ids = rewind_checkpoints
        .iter()
        .map(|checkpoint| checkpoint.run_id.clone())
        .collect::<HashSet<_>>();
    let mut rewind_file_changes = store
        .file_changes
        .iter()
        .filter(|change| change.thread_id == input.thread_id && rewind_run_ids.contains(&change.run_id))
        .cloned()
        .collect::<Vec<_>>();

    rewind_file_changes.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.run_id.cmp(&left.run_id))
            .then_with(|| right.path.cmp(&left.path))
    });

    let project_root = PathBuf::from(input.project_root);
    let mut restored_paths = Vec::new();
    let mut restored_path_set = HashSet::new();

    for change in &rewind_file_changes {
        let target_path = resolve_checkpoint_path(&project_root, &change.path);
        match change.before_content.as_deref() {
            Some(content) => write_reverted_file(&target_path, content)?,
            None => remove_reverted_path(&target_path)?,
        }

        if restored_path_set.insert(change.path.clone()) {
            restored_paths.push(change.path.clone());
        }
    }

    store.checkpoints.retain(|checkpoint| {
        !(checkpoint.thread_id == input.thread_id && rewind_run_ids.contains(&checkpoint.run_id))
    });
    store.file_changes.retain(|change| {
        !(change.thread_id == input.thread_id && rewind_run_ids.contains(&change.run_id))
    });
    save_turn_checkpoint_store(app_data_dir, &store)?;

    let mut removed_run_ids = rewind_run_ids.into_iter().collect::<Vec<_>>();
    removed_run_ids.sort();

    Ok(AgentTurnRewindResult {
        thread_id: input.thread_id,
        run_id: input.run_id,
        restored_paths,
        removed_run_ids,
        checkpoint_count: rewind_checkpoints.len() as u64,
        rewound_at: now,
    })
}

#[cfg(test)]
mod tests {
    use super::{get_turn_checkpoint_diff, list_turn_checkpoints, rewind_turn, save_turn_checkpoint};
    use crate::agent_runtime::types::{RewindAgentTurnInput, SaveAgentTurnCheckpointInput};
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
    fn saves_and_lists_turn_checkpoints() {
        let app_data_dir = make_temp_dir("turn-checkpoint-list");
        let checkpoint = save_turn_checkpoint(
            &app_data_dir,
            "checkpoint-1".into(),
            SaveAgentTurnCheckpointInput {
                thread_id: "thread-1".into(),
                run_id: "run-1".into(),
                message_id: Some("message-1".into()),
                summary: "Saved".into(),
                files: vec![crate::agent_runtime::types::SaveAgentTurnCheckpointFileInput {
                    path: "src/app.ts".into(),
                    before_content: Some("a".into()),
                    after_content: Some("a\nb".into()),
                }],
            },
            10,
        )
        .expect("save checkpoint");

        assert_eq!(checkpoint.insertions, 1);
        assert_eq!(checkpoint.files_changed.len(), 1);

        let checkpoints = list_turn_checkpoints(&app_data_dir, "thread-1").expect("list checkpoints");
        assert_eq!(checkpoints.len(), 1);
        assert_eq!(checkpoints[0].run_id, "run-1");

        fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn falls_back_to_previous_after_content_when_before_is_missing() {
        let app_data_dir = make_temp_dir("turn-checkpoint-fallback");
        save_turn_checkpoint(
            &app_data_dir,
            "checkpoint-1".into(),
            SaveAgentTurnCheckpointInput {
                thread_id: "thread-1".into(),
                run_id: "run-1".into(),
                message_id: None,
                summary: "First".into(),
                files: vec![crate::agent_runtime::types::SaveAgentTurnCheckpointFileInput {
                    path: "src/app.ts".into(),
                    before_content: Some("one".into()),
                    after_content: Some("one\ntwo".into()),
                }],
            },
            10,
        )
        .expect("save first checkpoint");

        save_turn_checkpoint(
            &app_data_dir,
            "checkpoint-2".into(),
            SaveAgentTurnCheckpointInput {
                thread_id: "thread-1".into(),
                run_id: "run-2".into(),
                message_id: None,
                summary: "Second".into(),
                files: vec![crate::agent_runtime::types::SaveAgentTurnCheckpointFileInput {
                    path: "src/app.ts".into(),
                    before_content: None,
                    after_content: Some("one\ntwo\nthree".into()),
                }],
            },
            20,
        )
        .expect("save second checkpoint");

        let diff =
            get_turn_checkpoint_diff(&app_data_dir, "thread-1", "run-2", "src/app.ts").expect("get diff");
        assert_eq!(diff.before_content.as_deref(), Some("one\ntwo"));
        assert_eq!(diff.insertions, 1);
        assert!(diff.diff.contains("+three"));

        fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn rewind_turn_restores_previous_file_content_and_prunes_checkpoints() {
        let app_data_dir = make_temp_dir("turn-checkpoint-rewind");
        let project_root = app_data_dir.join("project");
        fs::create_dir_all(project_root.join("src")).expect("create project src");
        fs::write(project_root.join("src").join("app.ts"), "zero").expect("seed file");

        save_turn_checkpoint(
            &app_data_dir,
            "checkpoint-1".into(),
            SaveAgentTurnCheckpointInput {
                thread_id: "thread-1".into(),
                run_id: "run-1".into(),
                message_id: None,
                summary: "First".into(),
                files: vec![crate::agent_runtime::types::SaveAgentTurnCheckpointFileInput {
                    path: "src/app.ts".into(),
                    before_content: Some("zero".into()),
                    after_content: Some("one".into()),
                }],
            },
            10,
        )
        .expect("save first checkpoint");
        fs::write(project_root.join("src").join("app.ts"), "one").expect("write first file content");

        save_turn_checkpoint(
            &app_data_dir,
            "checkpoint-2".into(),
            SaveAgentTurnCheckpointInput {
                thread_id: "thread-1".into(),
                run_id: "run-2".into(),
                message_id: None,
                summary: "Second".into(),
                files: vec![crate::agent_runtime::types::SaveAgentTurnCheckpointFileInput {
                    path: "src/app.ts".into(),
                    before_content: Some("one".into()),
                    after_content: Some("two".into()),
                }],
            },
            20,
        )
        .expect("save second checkpoint");
        fs::write(project_root.join("src").join("app.ts"), "two").expect("write second file content");

        let rewind_result = rewind_turn(
            &app_data_dir,
            RewindAgentTurnInput {
                thread_id: "thread-1".into(),
                run_id: "run-2".into(),
                project_root: project_root.to_string_lossy().to_string(),
            },
            30,
        )
        .expect("rewind second turn");

        assert_eq!(rewind_result.restored_paths, vec!["src/app.ts"]);
        assert_eq!(
            fs::read_to_string(project_root.join("src").join("app.ts")).expect("read rewound file"),
            "one"
        );

        let checkpoints = list_turn_checkpoints(&app_data_dir, "thread-1").expect("list after rewind");
        assert_eq!(checkpoints.len(), 1);
        assert_eq!(checkpoints[0].run_id, "run-1");

        fs::remove_dir_all(&app_data_dir).ok();
    }
}
