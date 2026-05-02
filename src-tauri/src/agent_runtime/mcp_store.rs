use super::context_store::ensure_agent_runtime_dir;
use super::types::{
    InvokeRuntimeMcpToolInput, RuntimeMcpServerRecord, RuntimeMcpToolCallRecord,
    RuntimeMcpToolRecord, UpsertRuntimeMcpServerInput,
};
use crate::collect_skill_discovery_entries;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const GOODNIGHT_SKILLS_SERVER_ID: &str = "goodnight-skills";
const GOODNIGHT_SKILLS_TOOL_NAME: &str = "list-skills";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpStoreData {
    #[serde(default)]
    servers: Vec<RuntimeMcpServerRecord>,
    #[serde(default)]
    tool_calls: Vec<RuntimeMcpToolCallRecord>,
}

fn mcp_store_path(app_data_dir: &Path) -> Result<PathBuf, String> {
    Ok(ensure_agent_runtime_dir(app_data_dir)?.join("runtime-mcp.json"))
}

fn load_mcp_store(app_data_dir: &Path) -> Result<McpStoreData, String> {
    let store_path = mcp_store_path(app_data_dir)?;
    if !store_path.exists() {
        return Ok(McpStoreData::default());
    }

    let content = fs::read_to_string(&store_path)
        .map_err(|error| format!("Failed to read runtime MCP store: {}", error))?;

    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse runtime MCP store: {}", error))
}

fn save_mcp_store(app_data_dir: &Path, store: &McpStoreData) -> Result<(), String> {
    let store_path = mcp_store_path(app_data_dir)?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize runtime MCP store: {}", error))?;

    fs::write(&store_path, content)
        .map_err(|error| format!("Failed to write runtime MCP store: {}", error))
}

fn default_goodnight_skills_server() -> RuntimeMcpServerRecord {
    RuntimeMcpServerRecord {
        id: GOODNIGHT_SKILLS_SERVER_ID.to_string(),
        name: "GoodNight Skills".to_string(),
        status: "connected".to_string(),
        transport: "builtin".to_string(),
        description: "Expose GoodNight local skills as a built-in MCP server.".to_string(),
        enabled: true,
        tool_names: vec![GOODNIGHT_SKILLS_TOOL_NAME.to_string()],
        tools: vec![RuntimeMcpToolRecord {
            name: GOODNIGHT_SKILLS_TOOL_NAME.to_string(),
            description: "List the currently discoverable GoodNight skills.".to_string(),
            requires_approval: false,
        }],
    }
}

fn build_skill_list_preview(app_data_dir: &Path) -> Result<(String, String), String> {
    let entries = collect_skill_discovery_entries(app_data_dir)?;
    let summary = format!("Listed {} GoodNight skills", entries.len());
    let preview = if entries.is_empty() {
        "No skills discovered.".to_string()
    } else {
        entries
            .iter()
            .map(|entry| format!("- {} ({})", entry.id, entry.name))
            .collect::<Vec<_>>()
            .join("\n")
    };

    Ok((summary, preview))
}

pub fn list_servers(app_data_dir: &Path) -> Result<Vec<RuntimeMcpServerRecord>, String> {
    let store = load_mcp_store(app_data_dir)?;
    let default_server = default_goodnight_skills_server();
    let mut servers = vec![default_server];

    for server in store.servers {
        if server.id != GOODNIGHT_SKILLS_SERVER_ID {
            servers.push(server);
        }
    }

    Ok(servers)
}

pub fn upsert_server(
    app_data_dir: &Path,
    input: UpsertRuntimeMcpServerInput,
) -> Result<RuntimeMcpServerRecord, String> {
    if input.id == GOODNIGHT_SKILLS_SERVER_ID {
        return Ok(default_goodnight_skills_server());
    }

    let mut store = load_mcp_store(app_data_dir)?;
    let server = RuntimeMcpServerRecord {
        id: input.id,
        name: input.name,
        status: input.status,
        transport: input.transport,
        description: input.description,
        enabled: input.enabled,
        tool_names: input.tool_names,
        tools: input.tools,
    };

    store.servers.retain(|existing| existing.id != server.id);
    store.servers.push(server.clone());
    save_mcp_store(app_data_dir, &store)?;
    Ok(server)
}

pub fn list_tool_calls(
    app_data_dir: &Path,
    thread_id: &str,
) -> Result<Vec<RuntimeMcpToolCallRecord>, String> {
    let mut tool_calls = load_mcp_store(app_data_dir)?
        .tool_calls
        .into_iter()
        .filter(|call| call.thread_id == thread_id)
        .collect::<Vec<_>>();

    tool_calls.sort_by(|left, right| left.started_at.cmp(&right.started_at));
    Ok(tool_calls)
}

pub fn invoke_tool(
    app_data_dir: &Path,
    input: InvokeRuntimeMcpToolInput,
    created_at: u64,
) -> Result<RuntimeMcpToolCallRecord, String> {
    let server = list_servers(app_data_dir)?
        .into_iter()
        .find(|server| server.id == input.server_id)
        .ok_or_else(|| format!("Runtime MCP server not found: {}", input.server_id))?;

    if !server.tool_names.iter().any(|tool| tool == &input.tool_name) {
        return Err(format!(
            "Runtime MCP tool not found: {}/{}",
            input.server_id, input.tool_name
        ));
    }

    let (summary, result_preview) = match (input.server_id.as_str(), input.tool_name.as_str()) {
        (GOODNIGHT_SKILLS_SERVER_ID, GOODNIGHT_SKILLS_TOOL_NAME) => {
            build_skill_list_preview(app_data_dir)?
        }
        _ => {
            return Err(format!(
                "Runtime MCP tool is not implemented: {}/{}",
                input.server_id, input.tool_name
            ))
        }
    };

    let tool_call = RuntimeMcpToolCallRecord {
        id: format!("mcp-call-{}-{}", created_at, input.tool_name),
        thread_id: input.thread_id,
        server_id: input.server_id,
        tool_name: input.tool_name,
        status: "completed".to_string(),
        summary,
        result_preview,
        arguments_text: input.arguments_text.unwrap_or_default(),
        started_at: created_at,
        completed_at: Some(created_at),
        error: None,
    };

    let mut store = load_mcp_store(app_data_dir)?;
    store.tool_calls.push(tool_call.clone());
    save_mcp_store(app_data_dir, &store)?;
    Ok(tool_call)
}

#[cfg(test)]
mod tests {
    use super::{invoke_tool, list_servers, list_tool_calls, GOODNIGHT_SKILLS_SERVER_ID};
    use crate::agent_runtime::types::InvokeRuntimeMcpToolInput;
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
    fn list_servers_includes_default_goodnight_skills_server() {
        let app_data_dir = make_temp_dir("runtime-mcp-servers");
        let servers = list_servers(&app_data_dir).expect("list servers");

        assert!(servers.iter().any(|server| server.id == GOODNIGHT_SKILLS_SERVER_ID));

        fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn invoke_tool_persists_tool_call_history() {
        let app_data_dir = make_temp_dir("runtime-mcp-tool-call");
        let tool_call = invoke_tool(
            &app_data_dir,
            InvokeRuntimeMcpToolInput {
                thread_id: "thread-1".into(),
                server_id: GOODNIGHT_SKILLS_SERVER_ID.into(),
                tool_name: "list-skills".into(),
                arguments_text: None,
            },
            42,
        )
        .expect("invoke tool");

        assert_eq!(tool_call.status, "completed");
        assert!(tool_call.result_preview.contains("- "));

        let tool_calls = list_tool_calls(&app_data_dir, "thread-1").expect("list tool calls");
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, tool_call.id);

        fs::remove_dir_all(&app_data_dir).ok();
    }
}
