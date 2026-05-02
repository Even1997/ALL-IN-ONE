use super::approval_store;
use super::mcp_store;
use super::memory_store;
use super::replay_store;
use super::settings_store;
use super::thread_store;
use super::types::{
    AgentThreadRecord, AgentTimelineEvent, AppendAgentTimelineEventInput,
    AppendRuntimeReplayEventInput, ApprovalRecord, CreateAgentThreadInput,
    EnqueueAgentApprovalInput, InvokeRuntimeMcpToolInput, ProjectMemoryEntry,
    ResolveAgentApprovalInput, RuntimeMcpServerRecord, RuntimeMcpToolCallRecord,
    RuntimeReplayEventRecord, RuntimeSettingsRecord, SaveProjectMemoryEntryInput,
    UpdateRuntimeSettingsInput, UpsertRuntimeMcpServerInput,
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
pub fn create_agent_thread(
    app_handle: tauri::AppHandle,
    input: CreateAgentThreadInput,
) -> Result<AgentThreadRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    let now = current_time_millis();
    let thread = AgentThreadRecord {
        id: build_record_id("thread"),
        project_id: input.project_id,
        title: input.title,
        provider_id: input.provider_id,
        created_at: now,
        updated_at: now,
    };

    thread_store::create_thread(&app_data_dir, thread)
}

#[tauri::command]
pub fn list_agent_threads(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<AgentThreadRecord>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    thread_store::list_threads(&app_data_dir, &project_id)
}

#[tauri::command]
pub fn append_agent_timeline_event(
    app_handle: tauri::AppHandle,
    input: AppendAgentTimelineEventInput,
) -> Result<AgentTimelineEvent, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    let event = AgentTimelineEvent {
        id: build_record_id("event"),
        thread_id: input.thread_id,
        turn_id: input.turn_id,
        kind: input.kind,
        payload: input.payload,
        created_at: current_time_millis(),
    };

    thread_store::append_timeline_event(&app_data_dir, event)
}

#[tauri::command]
pub fn save_project_memory_entry(
    app_handle: tauri::AppHandle,
    input: SaveProjectMemoryEntryInput,
) -> Result<ProjectMemoryEntry, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    let entry = ProjectMemoryEntry {
        id: input.id.unwrap_or_else(|| build_record_id("memory")),
        project_id: input.project_id,
        title: input.title,
        summary: input.summary,
        content: input.content,
        updated_at: current_time_millis(),
    };

    memory_store::save_entry(&app_data_dir, entry)
}

#[tauri::command]
pub fn list_project_memory_entries(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<ProjectMemoryEntry>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    memory_store::list_entries(&app_data_dir, &project_id)
}

#[tauri::command]
pub fn enqueue_agent_approval(
    app_handle: tauri::AppHandle,
    input: EnqueueAgentApprovalInput,
) -> Result<ApprovalRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    let approval = ApprovalRecord {
        id: build_record_id("approval"),
        thread_id: input.thread_id,
        action_type: input.action_type,
        risk_level: input.risk_level,
        summary: input.summary,
        status: "pending".to_string(),
        created_at: current_time_millis(),
        message_id: input.message_id,
    };

    approval_store::enqueue_approval(&app_data_dir, approval)
}

#[tauri::command]
pub fn resolve_agent_approval(
    app_handle: tauri::AppHandle,
    input: ResolveAgentApprovalInput,
) -> Result<ApprovalRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    approval_store::resolve_approval(&app_data_dir, &input.approval_id, &input.status)
}

#[tauri::command]
pub fn list_agent_approvals(
    app_handle: tauri::AppHandle,
    thread_id: String,
) -> Result<Vec<ApprovalRecord>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    approval_store::list_approvals(&app_data_dir, &thread_id)
}

#[tauri::command]
pub fn get_agent_sandbox_policy(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    Ok(settings_store::get_settings(&app_data_dir)?.sandbox_policy)
}

#[tauri::command]
pub fn set_agent_sandbox_policy(
    app_handle: tauri::AppHandle,
    policy: String,
) -> Result<String, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    Ok(
        settings_store::update_settings(
            &app_data_dir,
            UpdateRuntimeSettingsInput {
                sandbox_policy: Some(policy),
                auto_resume_on_launch: None,
                persist_resume_drafts: None,
            },
        )?
        .sandbox_policy,
    )
}

#[tauri::command]
pub fn get_agent_runtime_settings(
    app_handle: tauri::AppHandle,
) -> Result<RuntimeSettingsRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    settings_store::get_settings(&app_data_dir)
}

#[tauri::command]
pub fn update_agent_runtime_settings(
    app_handle: tauri::AppHandle,
    input: UpdateRuntimeSettingsInput,
) -> Result<RuntimeSettingsRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    settings_store::update_settings(&app_data_dir, input)
}

#[tauri::command]
pub fn list_runtime_mcp_servers(
    app_handle: tauri::AppHandle,
) -> Result<Vec<RuntimeMcpServerRecord>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    mcp_store::list_servers(&app_data_dir)
}

#[tauri::command]
pub fn upsert_runtime_mcp_server(
    app_handle: tauri::AppHandle,
    input: UpsertRuntimeMcpServerInput,
) -> Result<RuntimeMcpServerRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    mcp_store::upsert_server(&app_data_dir, input)
}

#[tauri::command]
pub fn list_runtime_mcp_tool_calls(
    app_handle: tauri::AppHandle,
    thread_id: String,
) -> Result<Vec<RuntimeMcpToolCallRecord>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    mcp_store::list_tool_calls(&app_data_dir, &thread_id)
}

#[tauri::command]
pub fn invoke_runtime_mcp_tool(
    app_handle: tauri::AppHandle,
    input: InvokeRuntimeMcpToolInput,
) -> Result<RuntimeMcpToolCallRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    mcp_store::invoke_tool(&app_data_dir, input, current_time_millis())
}

#[tauri::command]
pub fn append_runtime_replay_event(
    app_handle: tauri::AppHandle,
    input: AppendRuntimeReplayEventInput,
) -> Result<RuntimeReplayEventRecord, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    let event = RuntimeReplayEventRecord {
        id: build_record_id("replay"),
        thread_id: input.thread_id,
        event_type: input.event_type,
        payload: input.payload,
        created_at: current_time_millis(),
    };

    replay_store::append_event(&app_data_dir, event)
}

#[tauri::command]
pub fn list_runtime_replay_events(
    app_handle: tauri::AppHandle,
    thread_id: String,
) -> Result<Vec<RuntimeReplayEventRecord>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    replay_store::list_events(&app_data_dir, &thread_id)
}

#[cfg(test)]
mod tests {
    use super::build_record_id;
    use std::collections::HashSet;

    #[test]
    fn build_record_id_stays_unique_across_fast_calls() {
        let ids = (0..64)
            .map(|_| build_record_id("thread"))
            .collect::<Vec<_>>();
        let unique_ids = ids.iter().cloned().collect::<HashSet<_>>();

        assert_eq!(ids.len(), unique_ids.len());
    }
}
