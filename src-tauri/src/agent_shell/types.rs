use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentShellSessionRecord {
    pub id: String,
    pub project_id: String,
    pub provider_id: String,
    pub title: String,
    pub working_directory: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentShellSessionInput {
    pub project_id: String,
    pub provider_id: String,
    pub title: String,
    pub working_directory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentShellSettingsRecord {
    pub mode: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentShellSettingsInput {
    pub mode: Option<String>,
}
