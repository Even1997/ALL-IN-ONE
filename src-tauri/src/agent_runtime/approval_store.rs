use super::context_store::ensure_agent_runtime_dir;
use super::types::ApprovalRecord;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalStoreData {
    #[serde(default = "default_sandbox_policy")]
    sandbox_policy: String,
    #[serde(default)]
    approvals: Vec<ApprovalRecord>,
}

fn default_sandbox_policy() -> String {
    "ask".to_string()
}

impl Default for ApprovalStoreData {
    fn default() -> Self {
        Self {
            sandbox_policy: default_sandbox_policy(),
            approvals: Vec::new(),
        }
    }
}

fn approval_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("approvals.json"))
}

fn load_approval_store(app_data_dir: &Path) -> Result<ApprovalStoreData, String> {
    let store_path = approval_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(ApprovalStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read approval store: {}", error))?;

    serde_json::from_str(&content).map_err(|error| format!("Failed to parse approval store: {}", error))
}

fn save_approval_store(app_data_dir: &Path, store: &ApprovalStoreData) -> Result<(), String> {
    let store_path = approval_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize approval store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write approval store: {}", error))
}

pub fn enqueue_approval(
    app_data_dir: &Path,
    approval: ApprovalRecord,
) -> Result<ApprovalRecord, String> {
    let mut store = load_approval_store(app_data_dir)?;
    store.approvals.retain(|existing| existing.id != approval.id);
    store.approvals.push(approval.clone());
    save_approval_store(app_data_dir, &store)?;
    Ok(approval)
}

pub fn resolve_approval(
    app_data_dir: &Path,
    approval_id: &str,
    status: &str,
) -> Result<ApprovalRecord, String> {
    let mut store = load_approval_store(app_data_dir)?;
    let approval = store
        .approvals
        .iter_mut()
        .find(|approval| approval.id == approval_id)
        .ok_or_else(|| format!("Approval not found: {}", approval_id))?;

    approval.status = status.to_string();
    let result = approval.clone();
    save_approval_store(app_data_dir, &store)?;
    Ok(result)
}

pub fn list_approvals(
    app_data_dir: &Path,
    thread_id: &str,
) -> Result<Vec<ApprovalRecord>, String> {
    let mut approvals = load_approval_store(app_data_dir)?
        .approvals
        .into_iter()
        .filter(|approval| approval.thread_id == thread_id)
        .collect::<Vec<_>>();

    approvals.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(approvals)
}

pub fn get_legacy_sandbox_policy(app_data_dir: &Path) -> Result<Option<String>, String> {
    let store_path = approval_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(None);
    }

    Ok(Some(load_approval_store(app_data_dir)?.sandbox_policy))
}
