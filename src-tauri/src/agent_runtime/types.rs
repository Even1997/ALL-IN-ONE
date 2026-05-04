use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentThreadRecord {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub provider_id: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTimelineEvent {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub kind: String,
    pub payload: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryEntry {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRecord {
    pub id: String,
    pub thread_id: String,
    pub action_type: String,
    pub risk_level: String,
    pub summary: String,
    pub status: String,
    pub created_at: u64,
    pub message_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentThreadInput {
    pub project_id: String,
    pub title: String,
    pub provider_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendAgentTimelineEventInput {
    pub thread_id: String,
    pub turn_id: String,
    pub kind: String,
    pub payload: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectMemoryEntryInput {
    pub id: Option<String>,
    pub project_id: String,
    pub title: String,
    pub summary: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueAgentApprovalInput {
    pub thread_id: String,
    pub action_type: String,
    pub risk_level: String,
    pub summary: String,
    pub message_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveAgentApprovalInput {
    pub approval_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMcpToolRecord {
    pub name: String,
    pub description: String,
    pub requires_approval: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMcpServerRecord {
    pub id: String,
    pub name: String,
    pub status: String,
    pub transport: String,
    pub description: String,
    pub enabled: bool,
    pub tool_names: Vec<String>,
    pub tools: Vec<RuntimeMcpToolRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMcpToolCallRecord {
    pub id: String,
    pub thread_id: String,
    pub server_id: String,
    pub tool_name: String,
    pub status: String,
    pub summary: String,
    pub result_preview: String,
    pub arguments_text: String,
    pub started_at: u64,
    pub completed_at: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertRuntimeMcpServerInput {
    pub id: String,
    pub name: String,
    pub status: String,
    pub transport: String,
    pub description: String,
    pub enabled: bool,
    pub tool_names: Vec<String>,
    #[serde(default)]
    pub tools: Vec<RuntimeMcpToolRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvokeRuntimeMcpToolInput {
    pub thread_id: String,
    pub server_id: String,
    pub tool_name: String,
    pub arguments_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeReplayEventRecord {
    pub id: String,
    pub thread_id: String,
    pub event_type: String,
    pub payload: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendRuntimeReplayEventInput {
    pub thread_id: String,
    pub event_type: String,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettingsRecord {
    pub sandbox_policy: String,
    pub permission_mode: String,
    pub auto_resume_on_launch: bool,
    pub persist_resume_drafts: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRuntimeSettingsInput {
    pub sandbox_policy: Option<String>,
    pub permission_mode: Option<String>,
    pub auto_resume_on_launch: Option<bool>,
    pub persist_resume_drafts: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBackgroundTaskRecord {
    pub id: String,
    pub thread_id: String,
    pub run_kind: String,
    pub title: String,
    pub status: String,
    pub summary: String,
    pub payload_json: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAgentBackgroundTaskInput {
    pub id: Option<String>,
    pub thread_id: String,
    pub run_kind: String,
    pub title: String,
    pub status: String,
    pub summary: String,
    pub payload_json: String,
    pub created_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnCheckpointFileRecord {
    pub path: String,
    pub change_type: String,
    pub insertions: u64,
    pub deletions: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnCheckpointRecord {
    pub id: String,
    pub thread_id: String,
    pub run_id: String,
    pub message_id: Option<String>,
    pub summary: String,
    pub files_changed: Vec<AgentTurnCheckpointFileRecord>,
    pub insertions: u64,
    pub deletions: u64,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnCheckpointDiffRecord {
    pub checkpoint_id: String,
    pub thread_id: String,
    pub run_id: String,
    pub path: String,
    pub change_type: String,
    pub before_content: Option<String>,
    pub after_content: Option<String>,
    pub diff: String,
    pub insertions: u64,
    pub deletions: u64,
    pub created_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentTurnCheckpointFileInput {
    pub path: String,
    pub before_content: Option<String>,
    pub after_content: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentTurnCheckpointInput {
    pub thread_id: String,
    pub run_id: String,
    pub message_id: Option<String>,
    pub summary: String,
    pub files: Vec<SaveAgentTurnCheckpointFileInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnRewindResult {
    pub thread_id: String,
    pub run_id: String,
    pub restored_paths: Vec<String>,
    pub removed_run_ids: Vec<String>,
    pub checkpoint_count: u64,
    pub rewound_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewindAgentTurnInput {
    pub thread_id: String,
    pub run_id: String,
    pub project_root: String,
}
