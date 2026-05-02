use super::context_store::ensure_agent_shell_dir;
use super::types::AgentShellSessionRecord;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionStoreData {
    sessions: Vec<AgentShellSessionRecord>,
}

fn session_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_shell_dir(app_data_dir)?.join("sessions.json"))
}

fn load_session_store(app_data_dir: &Path) -> Result<SessionStoreData, String> {
    let store_path = session_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(SessionStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read agent shell session store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse agent shell session store: {}", error))
}

fn save_session_store(app_data_dir: &Path, store: &SessionStoreData) -> Result<(), String> {
    let store_path = session_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize agent shell session store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write agent shell session store: {}", error))
}

pub fn create_session(
    app_data_dir: &Path,
    session: AgentShellSessionRecord,
) -> Result<AgentShellSessionRecord, String> {
    let mut store = load_session_store(app_data_dir)?;
    store.sessions.retain(|existing| existing.id != session.id);
    store.sessions.push(session.clone());
    save_session_store(app_data_dir, &store)?;
    Ok(session)
}

pub fn list_sessions(
    app_data_dir: &Path,
    project_id: &str,
) -> Result<Vec<AgentShellSessionRecord>, String> {
    let mut sessions = load_session_store(app_data_dir)?
        .sessions
        .into_iter()
        .filter(|session| session.project_id == project_id)
        .collect::<Vec<_>>();

    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::{create_session, list_sessions};
    use crate::agent_shell::types::AgentShellSessionRecord;
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
        let path =
            std::env::temp_dir().join(format!("goodnight-{}-{}-{}", prefix, timestamp, unique));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    #[test]
    fn list_sessions_returns_latest_first_for_project() {
        let app_data_dir = make_temp_dir("agent-shell-session-order");
        create_session(
            &app_data_dir,
            AgentShellSessionRecord {
                id: "session-older".into(),
                project_id: "project-1".into(),
                provider_id: "claude".into(),
                title: "Older".into(),
                working_directory: Some("C:/workspace/project-1".into()),
                created_at: 10,
                updated_at: 10,
            },
        )
        .expect("save older session");
        create_session(
            &app_data_dir,
            AgentShellSessionRecord {
                id: "session-newer".into(),
                project_id: "project-1".into(),
                provider_id: "codex".into(),
                title: "Newer".into(),
                working_directory: Some("C:/workspace/project-1".into()),
                created_at: 20,
                updated_at: 20,
            },
        )
        .expect("save newer session");
        create_session(
            &app_data_dir,
            AgentShellSessionRecord {
                id: "session-other-project".into(),
                project_id: "project-2".into(),
                provider_id: "claude".into(),
                title: "Ignored".into(),
                working_directory: None,
                created_at: 30,
                updated_at: 30,
            },
        )
        .expect("save other project session");

        let sessions = list_sessions(&app_data_dir, "project-1").expect("list sessions");
        let session_ids = sessions
            .iter()
            .map(|session| session.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(session_ids, vec!["session-newer", "session-older"]);

        fs::remove_dir_all(&app_data_dir).ok();
    }
}
