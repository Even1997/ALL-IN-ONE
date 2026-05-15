// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_runtime;
mod agent_shell;
mod runtime_sidecar;

use agent_runtime::commands::{
    append_agent_timeline_event, append_runtime_replay_event, create_agent_thread,
    delete_runtime_mcp_server, enqueue_agent_approval, get_agent_runtime_settings,
    get_agent_sandbox_policy, get_agent_turn_checkpoint_diff, invoke_runtime_mcp_tool,
    list_agent_approvals, list_agent_background_tasks, list_agent_threads,
    list_agent_turn_checkpoints, list_project_memory_entries, list_runtime_mcp_servers,
    list_runtime_mcp_tool_calls, list_runtime_replay_events, resolve_agent_approval,
    rewind_agent_turn, save_agent_turn_checkpoint, save_project_memory_entry,
    set_agent_sandbox_policy, update_agent_runtime_settings, upsert_agent_background_task,
    upsert_runtime_mcp_server,
};
use agent_shell::commands::{
    create_agent_shell_session, get_agent_shell_settings, list_agent_shell_sessions,
    update_agent_shell_settings,
};
#[cfg(target_os = "windows")]
use encoding_rs::{Encoding, BIG5, EUC_KR, GBK, SHIFT_JIS, UTF_8};
use runtime_sidecar::{
    get_runtime_sidecar_status, start_runtime_sidecar, stop_runtime_sidecar, RuntimeSidecarManager,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

const GOODNIGHT_SKILLS_DIR_NAME: &str = "goodnight-skills";
const GOODNIGHT_BUILTIN_SKILLS_DIR_NAME: &str = "built-in";
const GOODNIGHT_IMPORTED_SKILLS_DIR_NAME: &str = "imported";
const GOODNIGHT_REMEMBERED_SKILLS_DIR_NAME: &str = "remembered";
const GOODNIGHT_SKILL_MARKDOWN_FILE_NAME: &str = "SKILL.md";
const GOODNIGHT_SKILL_MANIFEST_FILE_NAME: &str = "skill.json";
const GOODNIGHT_SKILL_SOURCE_REGISTRY_FILE_NAME: &str = "sources.json";
const GOODNIGHT_BUILTIN_SKILL_IDS: &[&str] = &[
    "goodnight-boundary",
    "goodnight-workspace-context",
    "goodnight-sketch-output",
    "goodnight-design-output",
];

fn read_file_as_string(file_path: &Path) -> std::io::Result<String> {
    let bytes = fs::read(file_path)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn normalize_boundary_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn canonical_or_normalized_path(path: &Path) -> PathBuf {
    path.canonicalize()
        .unwrap_or_else(|_| normalize_boundary_path(path))
}

fn path_stays_under_root(path: &Path, root: &Path) -> bool {
    let normalized_path = canonical_or_normalized_path(path);
    let normalized_root = canonical_or_normalized_path(root);
    let path_text = normalized_path
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();
    let root_text = normalized_root
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase();

    path_text == root_text || path_text.starts_with(&format!("{}/", root_text))
}

fn ensure_project_path(project_root: Option<&String>, target_path: &str) -> Result<(), ToolResult> {
    let Some(project_root) = project_root else {
        return Ok(());
    };

    if !path_stays_under_root(Path::new(target_path), Path::new(project_root)) {
        return Err(ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!(
                "Cannot access path outside the current project: {}",
                target_path
            )),
        });
    }

    Ok(())
}

fn parse_git_status_paths(output: &str) -> HashSet<String> {
    output
        .lines()
        .filter_map(|line| {
            if line.len() < 4 {
                return None;
            }

            let mut path = line[3..].trim().to_string();
            if let Some((_, renamed_to)) = path.rsplit_once(" -> ") {
                path = renamed_to.trim().to_string();
            }

            let normalized = path.trim_matches('"').replace('\\', "/");
            if normalized.is_empty() {
                None
            } else {
                Some(normalized)
            }
        })
        .collect()
}

fn collect_git_status_paths(project_root: &Path) -> Option<HashSet<String>> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(project_root)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    Some(parse_git_status_paths(
        String::from_utf8_lossy(&output.stdout).as_ref(),
    ))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ViewParams {
    pub project_root: Option<String>,
    pub file_path: String,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

fn run_command_with_timeout(mut process: Command, timeout: Option<u64>) -> std::io::Result<Output> {
    let timeout_ms = timeout.unwrap_or(60_000).clamp(1, 600_000);
    process.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = process.spawn()?;
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let poll_interval = Duration::from_millis(50);

    loop {
        if child.try_wait()?.is_some() {
            return child.wait_with_output();
        }

        let now = Instant::now();
        if now >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                format!("Command timed out after {} ms", timeout_ms),
            ));
        }

        let remaining = deadline.saturating_duration_since(now);
        thread::sleep(std::cmp::min(poll_interval, remaining));
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" {
    fn GetOEMCP() -> u32;
}

#[cfg(target_os = "windows")]
fn windows_console_encoding() -> Option<&'static Encoding> {
    match unsafe { GetOEMCP() } {
        65001 => Some(UTF_8),
        936 => Some(GBK),
        950 => Some(BIG5),
        932 => Some(SHIFT_JIS),
        949 => Some(EUC_KR),
        874 => Encoding::for_label(b"windows-874"),
        1250 => Encoding::for_label(b"windows-1250"),
        1251 => Encoding::for_label(b"windows-1251"),
        1252 => Encoding::for_label(b"windows-1252"),
        1253 => Encoding::for_label(b"windows-1253"),
        1254 => Encoding::for_label(b"windows-1254"),
        1255 => Encoding::for_label(b"windows-1255"),
        1256 => Encoding::for_label(b"windows-1256"),
        1257 => Encoding::for_label(b"windows-1257"),
        1258 => Encoding::for_label(b"windows-1258"),
        _ => None,
    }
}

fn decode_command_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        return text;
    }

    #[cfg(target_os = "windows")]
    if let Some(encoding) = windows_console_encoding() {
        let (decoded, _, _) = encoding.decode(bytes);
        return decoded.into_owned();
    }

    String::from_utf8_lossy(bytes).into_owned()
}

fn format_write_error(file_path: &str, error: &std::io::Error) -> String {
    if error.kind() == ErrorKind::PermissionDenied {
        #[cfg(target_os = "windows")]
        {
            return format!(
                "Error writing file: Access denied for {}. The path is inside the current project, but Windows blocked the write. Check whether the file or folder is read-only, open in another app, or protected by Controlled Folder Access. Original error: {}",
                file_path, error
            );
        }

        #[cfg(not(target_os = "windows"))]
        {
            return format!(
                "Error writing file: Access denied for {}. The path is inside the current project, but the operating system blocked the write. Check file permissions or whether another app is locking it. Original error: {}",
                file_path, error
            );
        }
    }

    format!("Error writing file: {}", error)
}

#[cfg(target_os = "windows")]
fn build_powershell_process(executable: &str, command: &str) -> Command {
    let mut process = Command::new(executable);
    process
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(command);
    process
}

#[cfg(target_os = "windows")]
fn run_windows_powershell_command(
    command: &str,
    cwd: Option<&String>,
    timeout: Option<u64>,
) -> std::io::Result<Output> {
    let mut preferred = build_powershell_process("pwsh", command);
    if let Some(cwd) = cwd {
        preferred.current_dir(cwd);
    }

    match run_command_with_timeout(preferred, timeout) {
        Err(error) if error.kind() == ErrorKind::NotFound => {
            let mut fallback = build_powershell_process("powershell", command);
            if let Some(cwd) = cwd {
                fallback.current_dir(cwd);
            }
            run_command_with_timeout(fallback, timeout)
        }
        other => other,
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteParams {
    pub project_root: Option<String>,
    pub file_path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditParams {
    pub project_root: Option<String>,
    pub file_path: String,
    pub old_string: String,
    pub new_string: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GrepParams {
    pub pattern: String,
    pub path: Option<String>,
    pub include: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LsParams {
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GlobParams {
    pub pattern: String,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BashParams {
    pub project_root: Option<String>,
    pub command: String,
    pub timeout: Option<u64>,
    pub cwd: Option<String>,
    pub shell: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoveParams {
    pub project_root: Option<String>,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameParams {
    pub project_root: Option<String>,
    pub from_path: String,
    pub to_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentParams {
    pub agent: String,
    pub project_root: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentPromptParams {
    pub agent: String,
    pub project_root: String,
    pub prompt: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentResult {
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
    pub changed_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfigProbeEntry {
    pub path: String,
    pub exists: bool,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentConfigSnapshot {
    pub home_dir: String,
    pub claude_home: LocalConfigProbeEntry,
    pub claude_settings: LocalConfigProbeEntry,
    pub claude_commands: LocalConfigProbeEntry,
    pub claude_plugins: LocalConfigProbeEntry,
    pub codex_home: LocalConfigProbeEntry,
    pub codex_skills: LocalConfigProbeEntry,
    pub codex_agents: LocalConfigProbeEntry,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoverLocalSkillsParams {
    project_root: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportLocalSkillParams {
    source_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportGithubSkillParams {
    repo: String,
    path: String,
    git_ref: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncSkillToRuntimeParams {
    skill_id: String,
    runtime: SkillRuntimeTarget,
    project_root: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteLibrarySkillParams {
    skill_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillSourceRegistryEntry {
    skill_id: String,
    name: String,
    source: String,
    source_path: String,
    manifest_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillDiscoveryEntry {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) category: String,
    pub(crate) source: String,
    pub(crate) path: String,
    pub(crate) manifest_path: String,
    pub(crate) imported: bool,
    pub(crate) builtin: bool,
    pub(crate) deletable: bool,
    pub(crate) synced_to_codex: bool,
    pub(crate) synced_to_claude: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillRuntimeSyncResult {
    skill_id: String,
    runtime: SkillRuntimeTarget,
    target_path: String,
    synced: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillDeleteResult {
    skill_id: String,
    deleted_path: String,
    deleted: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SkillRuntimeTarget {
    Codex,
    Claude,
}

#[derive(Debug, Clone)]
struct SkillDescriptor {
    id: String,
    name: String,
    category: String,
    skill_dir: PathBuf,
    manifest_path: PathBuf,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectStorageSettingsPayload {
    root_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectStorageSettings {
    root_path: String,
    default_path: String,
    is_default: bool,
}

fn normalize_project_storage_root_path(
    root_path: Option<String>,
) -> Result<Option<PathBuf>, String> {
    let Some(root_path) = root_path else {
        return Ok(None);
    };

    let trimmed = root_path.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let normalized = PathBuf::from(trimmed);
    if !normalized.is_absolute() {
        return Err("Project storage path must be an absolute path.".to_string());
    }

    Ok(Some(normalized))
}

fn normalize_saved_project_storage_root_path(
    root_path: Option<String>,
) -> Result<Option<PathBuf>, String> {
    match normalize_project_storage_root_path(root_path) {
        Ok(path) => Ok(path),
        Err(_) => Ok(None),
    }
}

fn get_default_projects_root_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .document_dir()
        .map_err(|e| format!("Failed to resolve documents directory: {}", e))
        .map(|path| path.join("GoodNight").join("projects"))
}

fn get_project_storage_settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve app config directory: {}", e))?;

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create app config directory: {}", e))?;

    Ok(config_dir.join("project-storage.json"))
}

fn read_project_storage_settings_payload(
    app_handle: &tauri::AppHandle,
) -> Result<ProjectStorageSettingsPayload, String> {
    let settings_path = get_project_storage_settings_path(app_handle)?;
    if !settings_path.exists() {
        return Ok(ProjectStorageSettingsPayload::default());
    }

    let content = read_file_as_string(&settings_path)
        .map_err(|e| format!("Failed to read project storage settings: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse project storage settings: {}", e))
}

fn write_project_storage_settings_payload(
    app_handle: &tauri::AppHandle,
    payload: &ProjectStorageSettingsPayload,
) -> Result<(), String> {
    let settings_path = get_project_storage_settings_path(app_handle)?;

    if payload.root_path.is_none() {
        if settings_path.exists() {
            fs::remove_file(&settings_path)
                .map_err(|e| format!("Failed to clear project storage settings: {}", e))?;
        }
        return Ok(());
    }

    let content = serde_json::to_string_pretty(payload)
        .map_err(|e| format!("Failed to serialize project storage settings: {}", e))?;

    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to save project storage settings: {}", e))
}

fn resolve_project_storage_root_path(
    default_path: PathBuf,
    override_path: Option<PathBuf>,
) -> (PathBuf, bool) {
    match override_path {
        Some(path) if path != default_path => (path, false),
        _ => (default_path, true),
    }
}

fn resolve_project_storage_paths(
    app_handle: &tauri::AppHandle,
) -> Result<(PathBuf, PathBuf, bool), String> {
    let default_path = get_default_projects_root_path(app_handle)?;
    let payload = read_project_storage_settings_payload(app_handle)?;
    let override_path = normalize_saved_project_storage_root_path(payload.root_path)?;
    let (projects_root, is_default) =
        resolve_project_storage_root_path(default_path.clone(), override_path);

    Ok((projects_root, default_path, is_default))
}

fn display_project_storage_path(path: PathBuf) -> String {
    let display = path.to_string_lossy().trim().to_string();

    #[cfg(target_os = "windows")]
    {
        if let Some(without_prefix) = display.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{}", without_prefix)
        } else {
            display
                .strip_prefix(r"\\?\")
                .unwrap_or(display.as_str())
                .to_string()
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        display
    }
}

fn build_project_storage_settings(
    app_handle: &tauri::AppHandle,
) -> Result<ProjectStorageSettings, String> {
    let (projects_root, default_path, is_default) = resolve_project_storage_paths(app_handle)?;

    fs::create_dir_all(&projects_root)
        .map_err(|e| format!("Failed to create projects directory: {}", e))?;

    let root_path =
        display_project_storage_path(projects_root.canonicalize().unwrap_or(projects_root));

    Ok(ProjectStorageSettings {
        root_path,
        default_path: display_project_storage_path(default_path),
        is_default,
    })
}

fn get_projects_root_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_project_storage_paths(app_handle).map(|(projects_root, _, _)| projects_root)
}

fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn resolve_home_dir() -> Result<PathBuf, String> {
    let candidate = if cfg!(target_os = "windows") {
        env::var("USERPROFILE").ok()
    } else {
        env::var("HOME").ok()
    };

    let home_dir = candidate
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to resolve the current user home directory.".to_string())?;

    if !home_dir.is_absolute() {
        return Err("Resolved home directory is not an absolute path.".to_string());
    }

    Ok(home_dir)
}

fn build_local_config_probe(path: PathBuf, include_content: bool) -> LocalConfigProbeEntry {
    let exists = path.exists();
    let content = if include_content && path.is_file() {
        read_file_as_string(&path).ok()
    } else {
        None
    };

    LocalConfigProbeEntry {
        path: display_project_storage_path(path),
        exists,
        content,
    }
}

fn get_goodnight_skill_root_from_data_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(GOODNIGHT_SKILLS_DIR_NAME)
}

fn get_goodnight_builtin_skill_root_from_data_dir(app_data_dir: &Path) -> PathBuf {
    get_goodnight_skill_root_from_data_dir(app_data_dir).join(GOODNIGHT_BUILTIN_SKILLS_DIR_NAME)
}

fn get_goodnight_imported_skill_root_from_data_dir(app_data_dir: &Path) -> PathBuf {
    get_goodnight_skill_root_from_data_dir(app_data_dir).join(GOODNIGHT_IMPORTED_SKILLS_DIR_NAME)
}

fn get_goodnight_remembered_skill_root_from_data_dir(app_data_dir: &Path) -> PathBuf {
    get_goodnight_skill_root_from_data_dir(app_data_dir).join(GOODNIGHT_REMEMBERED_SKILLS_DIR_NAME)
}

fn get_skill_source_registry_path(app_data_dir: &Path) -> PathBuf {
    get_goodnight_skill_root_from_data_dir(app_data_dir)
        .join(GOODNIGHT_SKILL_SOURCE_REGISTRY_FILE_NAME)
}

fn get_project_skill_root(project_root: &Path) -> PathBuf {
    project_root.join(".agents").join("skills")
}

fn get_goodnight_skill_source_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(GOODNIGHT_SKILLS_DIR_NAME)
        .join(GOODNIGHT_BUILTIN_SKILLS_DIR_NAME)
}

fn ensure_goodnight_skill_library_dirs(app_data_dir: &Path) -> Result<(), String> {
    for dir in [
        get_goodnight_skill_root_from_data_dir(app_data_dir),
        get_goodnight_builtin_skill_root_from_data_dir(app_data_dir),
        get_goodnight_imported_skill_root_from_data_dir(app_data_dir),
        get_goodnight_remembered_skill_root_from_data_dir(app_data_dir),
    ] {
        fs::create_dir_all(&dir).map_err(|error| {
            format!(
                "Failed to create skill library directory {}: {}",
                dir.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn read_skill_source_registry(app_data_dir: &Path) -> Result<Vec<SkillSourceRegistryEntry>, String> {
    let registry_path = get_skill_source_registry_path(app_data_dir);
    if !registry_path.is_file() {
        return Ok(Vec::new());
    }

    let source = read_file_as_string(&registry_path).map_err(|error| {
        format!(
            "Failed to read skill source registry {}: {}",
            registry_path.display(),
            error
        )
    })?;

    serde_json::from_str(&source).map_err(|error| {
        format!(
            "Failed to parse skill source registry {}: {}",
            registry_path.display(),
            error
        )
    })
}

fn write_skill_source_registry(
    app_data_dir: &Path,
    entries: &[SkillSourceRegistryEntry],
) -> Result<(), String> {
    let registry_path = get_skill_source_registry_path(app_data_dir);
    let source = serde_json::to_string_pretty(entries)
        .map_err(|error| format!("Failed to serialize skill source registry: {}", error))?;

    fs::write(&registry_path, source).map_err(|error| {
        format!(
            "Failed to write skill source registry {}: {}",
            registry_path.display(),
            error
        )
    })
}

fn upsert_skill_source_registry_entry(
    app_data_dir: &Path,
    entry: SkillSourceRegistryEntry,
) -> Result<(), String> {
    let mut entries = read_skill_source_registry(app_data_dir)?;
    if let Some(existing) = entries
        .iter_mut()
        .find(|existing| existing.skill_id == entry.skill_id)
    {
        *existing = entry;
    } else {
        entries.push(entry);
    }
    entries.sort_by(|left, right| left.skill_id.cmp(&right.skill_id));
    write_skill_source_registry(app_data_dir, &entries)
}

fn remove_skill_source_registry_entry(app_data_dir: &Path, skill_id: &str) -> Result<(), String> {
    let mut entries = read_skill_source_registry(app_data_dir)?;
    entries.retain(|entry| entry.skill_id != skill_id);
    write_skill_source_registry(app_data_dir, &entries)
}

fn remember_personal_skill_snapshot(
    app_data_dir: &Path,
    skill_dir: &Path,
    source: &str,
    source_path: &str,
) -> Result<SkillSourceRegistryEntry, String> {
    let descriptor = load_skill_descriptor(skill_dir, true)?;
    let remembered_dir =
        get_goodnight_remembered_skill_root_from_data_dir(app_data_dir).join(&descriptor.id);
    if remembered_dir.is_dir() {
        fs::remove_dir_all(&remembered_dir).map_err(|error| {
            format!(
                "Failed to replace remembered skill snapshot {}: {}",
                remembered_dir.display(),
                error
            )
        })?;
    }

    copy_directory_contents(skill_dir, &remembered_dir)?;

    let registry_entry = SkillSourceRegistryEntry {
        skill_id: descriptor.id.clone(),
        name: descriptor.name.clone(),
        source: source.to_string(),
        source_path: source_path.to_string(),
        manifest_path: display_project_storage_path(
            remembered_dir.join(GOODNIGHT_SKILL_MANIFEST_FILE_NAME),
        ),
    };
    upsert_skill_source_registry_entry(app_data_dir, registry_entry.clone())?;
    Ok(registry_entry)
}

fn copy_directory_contents(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(target_dir).map_err(|error| {
        format!(
            "Failed to create directory {}: {}",
            target_dir.display(),
            error
        )
    })?;

    let entries = fs::read_dir(source_dir).map_err(|error| {
        format!(
            "Failed to read directory {}: {}",
            source_dir.display(),
            error
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read directory entry in {}: {}",
                source_dir.display(),
                error
            )
        })?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());

        if source_path.is_dir() {
            copy_directory_contents(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|error| {
                format!(
                    "Failed to copy {} to {}: {}",
                    source_path.display(),
                    target_path.display(),
                    error
                )
            })?;
        }
    }

    Ok(())
}

fn ensure_builtin_skills_installed(app_data_dir: &Path) -> Result<(), String> {
    ensure_goodnight_skill_library_dirs(app_data_dir)?;

    let source_root = get_goodnight_skill_source_root();
    let builtin_root = get_goodnight_builtin_skill_root_from_data_dir(app_data_dir);
    let expected_skill_ids: HashSet<&str> = GOODNIGHT_BUILTIN_SKILL_IDS.iter().copied().collect();

    let installed_entries = fs::read_dir(&builtin_root).map_err(|error| {
        format!(
            "Failed to read built-in skill directory {}: {}",
            builtin_root.display(),
            error
        )
    })?;

    for entry in installed_entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read directory entry in {}: {}",
                builtin_root.display(),
                error
            )
        })?;
        let installed_skill_dir = entry.path();
        if !installed_skill_dir.is_dir() {
            continue;
        }

        let skill_id = entry.file_name().to_string_lossy().to_string();
        if !expected_skill_ids.contains(skill_id.as_str()) {
            fs::remove_dir_all(&installed_skill_dir).map_err(|error| {
                format!(
                    "Failed to remove stale built-in skill directory {}: {}",
                    installed_skill_dir.display(),
                    error
                )
            })?;
        }
    }

    for skill_id in GOODNIGHT_BUILTIN_SKILL_IDS {
        let source_dir = source_root.join(skill_id);
        if !source_dir.is_dir() {
            return Err(format!(
                "Built-in skill source is missing: {}",
                source_dir.display()
            ));
        }

        copy_directory_contents(&source_dir, &builtin_root.join(skill_id))?;
    }

    Ok(())
}

fn parse_skill_frontmatter(markdown: &str) -> (Option<String>, Option<String>) {
    let mut lines = markdown.lines();
    if lines.next() != Some("---") {
        return (None, None);
    }

    let mut name = None;
    let mut description = None;
    for line in lines {
        if line.trim() == "---" {
            break;
        }

        if let Some((key, value)) = line.split_once(':') {
            let normalized_value = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            match key.trim() {
                "name" if !normalized_value.is_empty() => name = Some(normalized_value),
                "description" if !normalized_value.is_empty() => {
                    description = Some(normalized_value)
                }
                _ => {}
            }
        }
    }

    (name, description)
}

fn sanitize_skill_id(raw: &str) -> String {
    let mut id = String::new();
    let mut last_was_dash = false;

    for ch in raw.chars() {
        let normalized = ch.to_ascii_lowercase();
        if normalized.is_ascii_alphanumeric() {
            id.push(normalized);
            last_was_dash = false;
        } else if !last_was_dash && !id.is_empty() {
            id.push('-');
            last_was_dash = true;
        }
    }

    let trimmed = id.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "skill".to_string()
    } else {
        trimmed
    }
}

fn humanize_skill_id(skill_id: &str) -> String {
    skill_id
        .split(['-', '_'])
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => {
                    let mut label = first.to_ascii_uppercase().to_string();
                    label.push_str(chars.as_str());
                    label
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn generate_skill_manifest(
    skill_id: &str,
    skill_name: &str,
    source_type: &str,
) -> serde_json::Value {
    serde_json::json!({
        "id": skill_id,
        "name": skill_name,
        "version": "1.0.0",
        "category": "knowledge",
        "source": {
            "type": source_type
        },
        "capabilities": ["prompt"],
        "entry": {
            "prompt": GOODNIGHT_SKILL_MARKDOWN_FILE_NAME
        },
        "support": {
            "built-in": "full",
            "codex": "partial",
            "claude": "partial"
        }
    })
}

fn load_skill_descriptor(
    skill_dir: &Path,
    allow_seed_manifest: bool,
) -> Result<SkillDescriptor, String> {
    let prompt_path = skill_dir.join(GOODNIGHT_SKILL_MARKDOWN_FILE_NAME);
    if !prompt_path.is_file() {
        return Err(format!(
            "Skill prompt file is missing: {}",
            prompt_path.display()
        ));
    }

    let prompt_source = read_file_as_string(&prompt_path).map_err(|error| {
        format!(
            "Failed to read skill prompt {}: {}",
            prompt_path.display(),
            error
        )
    })?;
    let manifest_path = skill_dir.join(GOODNIGHT_SKILL_MANIFEST_FILE_NAME);
    let (frontmatter_name, _) = parse_skill_frontmatter(&prompt_source);
    let fallback_id = skill_dir
        .file_name()
        .map(|value| sanitize_skill_id(&value.to_string_lossy()))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "skill".to_string());

    let existing_manifest = if manifest_path.is_file() {
        let content = read_file_as_string(&manifest_path).map_err(|error| {
            format!(
                "Failed to read skill manifest {}: {}",
                manifest_path.display(),
                error
            )
        })?;
        serde_json::from_str::<serde_json::Value>(&content).ok()
    } else {
        None
    };

    let skill_id = existing_manifest
        .as_ref()
        .and_then(|manifest| manifest.get("id"))
        .and_then(|value| value.as_str())
        .map(sanitize_skill_id)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback_id.clone());

    let skill_name = existing_manifest
        .as_ref()
        .and_then(|manifest| manifest.get("name"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .or(frontmatter_name)
        .unwrap_or_else(|| humanize_skill_id(&skill_id));
    let skill_category = existing_manifest
        .as_ref()
        .and_then(|manifest| manifest.get("category"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "knowledge".to_string());

    if allow_seed_manifest && !manifest_path.is_file() {
        let manifest = generate_skill_manifest(&skill_id, &skill_name, "imported");
        let content = serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("Failed to serialize generated skill manifest: {}", error))?;
        fs::write(&manifest_path, content).map_err(|error| {
            format!(
                "Failed to write generated skill manifest {}: {}",
                manifest_path.display(),
                error
            )
        })?;
    }

    Ok(SkillDescriptor {
        id: skill_id,
        name: skill_name,
        category: skill_category,
        skill_dir: skill_dir.to_path_buf(),
        manifest_path,
    })
}

fn list_skill_directories_recursive(root_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !root_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut directories = Vec::new();
    let mut pending = vec![root_dir.to_path_buf()];

    while let Some(current_dir) = pending.pop() {
        for entry in fs::read_dir(&current_dir).map_err(|error| {
            format!(
                "Failed to read skills directory {}: {}",
                current_dir.display(),
                error
            )
        })? {
            let entry = entry.map_err(|error| {
                format!(
                    "Failed to read skills directory entry in {}: {}",
                    current_dir.display(),
                    error
                )
            })?;
            let candidate = entry.path();
            if !candidate.is_dir() {
                continue;
            }

            if candidate.join(GOODNIGHT_SKILL_MARKDOWN_FILE_NAME).is_file() {
                directories.push(candidate);
            } else {
                pending.push(candidate);
            }
        }
    }

    directories.sort();
    directories.dedup();
    Ok(directories)
}

fn is_skill_imported(app_data_dir: &Path, skill_id: &str) -> bool {
    let imported_dir = get_goodnight_imported_skill_root_from_data_dir(app_data_dir).join(skill_id);
    imported_dir.is_dir()
}

fn is_system_skill(category: &str) -> bool {
    category.eq_ignore_ascii_case("system")
}

fn is_skill_synced_to_codex(home_dir: &Path, skill_id: &str) -> bool {
    home_dir
        .join(".codex")
        .join("skills")
        .join(skill_id)
        .is_dir()
}

fn get_claude_command_path(home_dir: &Path, skill_id: &str) -> PathBuf {
    home_dir
        .join(".claude")
        .join("commands")
        .join(format!("{}.md", skill_id))
}

fn get_claude_plugin_skill_dir(home_dir: &Path, skill_id: &str) -> PathBuf {
    home_dir
        .join(".claude")
        .join("plugins")
        .join(GOODNIGHT_SKILLS_DIR_NAME)
        .join(skill_id)
}

fn is_skill_synced_to_claude(home_dir: &Path, skill_id: &str) -> bool {
    get_claude_command_path(home_dir, skill_id).is_file()
        || get_claude_plugin_skill_dir(home_dir, skill_id).is_dir()
}

fn build_skill_entry(
    _app_data_dir: &Path,
    home_dir: &Path,
    skill_dir: &Path,
    source: &str,
    imported: bool,
    builtin: bool,
    deletable: bool,
    allow_seed_manifest: bool,
) -> Result<SkillDiscoveryEntry, String> {
    let descriptor = load_skill_descriptor(skill_dir, allow_seed_manifest)?;

    Ok(SkillDiscoveryEntry {
        id: descriptor.id.clone(),
        name: descriptor.name,
        category: descriptor.category,
        source: source.to_string(),
        path: display_project_storage_path(descriptor.skill_dir),
        manifest_path: display_project_storage_path(descriptor.manifest_path),
        imported,
        builtin,
        deletable,
        synced_to_codex: is_skill_synced_to_codex(home_dir, &descriptor.id),
        synced_to_claude: is_skill_synced_to_claude(home_dir, &descriptor.id),
    })
}

fn find_library_skill_dir(app_data_dir: &Path, skill_id: &str) -> Option<PathBuf> {
    let imported_candidate =
        get_goodnight_imported_skill_root_from_data_dir(app_data_dir).join(skill_id);
    if imported_candidate.is_dir() {
        return Some(imported_candidate);
    }

    let builtin_candidate =
        get_goodnight_builtin_skill_root_from_data_dir(app_data_dir).join(skill_id);
    if builtin_candidate.is_dir() {
        if let Ok(descriptor) = load_skill_descriptor(&builtin_candidate, false) {
            if is_system_skill(&descriptor.category) {
                return Some(builtin_candidate);
            }
        }
    }

    None
}

fn build_github_skill_download_temp_dir(app_data_dir: &Path) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    get_goodnight_imported_skill_root_from_data_dir(app_data_dir)
        .join(format!("__incoming__{}", millis))
}

fn github_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("GoodNight Desktop")
        .build()
        .map_err(|error| format!("Failed to create GitHub client: {}", error))
}

fn download_github_contents(
    client: &reqwest::blocking::Client,
    api_url: &str,
    target_dir: &Path,
) -> Result<(), String> {
    fs::create_dir_all(target_dir).map_err(|error| {
        format!(
            "Failed to create GitHub import directory {}: {}",
            target_dir.display(),
            error
        )
    })?;

    let response = client
        .get(api_url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|error| format!("Failed to query GitHub contents API: {}", error))?
        .error_for_status()
        .map_err(|error| format!("GitHub contents API returned an error: {}", error))?;

    let payload = serde_json::from_str::<serde_json::Value>(
        &response
            .text()
            .map_err(|error| format!("Failed to read GitHub contents response: {}", error))?,
    )
    .map_err(|error| format!("Failed to parse GitHub contents response: {}", error))?;

    let entries = payload.as_array().cloned().unwrap_or_else(|| vec![payload]);

    for entry in entries {
        let entry_type = entry
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let name = entry
            .get("name")
            .and_then(|value| value.as_str())
            .ok_or_else(|| "GitHub content entry is missing a file name.".to_string())?;

        match entry_type {
            "file" => {
                let download_url = entry
                    .get("download_url")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| {
                        format!(
                            "GitHub file entry {} does not include a download URL.",
                            name
                        )
                    })?;
                let bytes = client
                    .get(download_url)
                    .send()
                    .map_err(|error| {
                        format!("Failed to download GitHub file {}: {}", download_url, error)
                    })?
                    .error_for_status()
                    .map_err(|error| {
                        format!(
                            "GitHub file download failed for {}: {}",
                            download_url, error
                        )
                    })?
                    .bytes()
                    .map_err(|error| {
                        format!(
                            "Failed to read GitHub file bytes {}: {}",
                            download_url, error
                        )
                    })?;

                fs::write(target_dir.join(name), &bytes).map_err(|error| {
                    format!(
                        "Failed to write imported GitHub file {}: {}",
                        target_dir.join(name).display(),
                        error
                    )
                })?;
            }
            "dir" => {
                let next_url = entry
                    .get("url")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| {
                        format!(
                            "GitHub directory entry {} does not include an API URL.",
                            name
                        )
                    })?;
                download_github_contents(client, next_url, &target_dir.join(name))?;
            }
            _ => {}
        }
    }

    Ok(())
}

pub(crate) fn collect_skill_discovery_entries(
    app_data_dir: &Path,
    project_root: Option<&Path>,
) -> Result<Vec<SkillDiscoveryEntry>, String> {
    ensure_builtin_skills_installed(app_data_dir)?;

    let home_dir = resolve_home_dir()?;
    let builtin_root = get_goodnight_builtin_skill_root_from_data_dir(app_data_dir);
    let imported_root = get_goodnight_imported_skill_root_from_data_dir(app_data_dir);
    let remembered_root = get_goodnight_remembered_skill_root_from_data_dir(app_data_dir);
    let source_registry_entries = read_skill_source_registry(app_data_dir)?;
    let mut seen_skill_ids = HashSet::new();
    let mut entries = Vec::new();

    for skill_dir in list_skill_directories_recursive(&builtin_root)? {
        let descriptor = load_skill_descriptor(&skill_dir, false)?;
        if !seen_skill_ids.insert(descriptor.id.clone()) {
            continue;
        }

        let entry = if is_system_skill(&descriptor.category) {
            build_skill_entry(
                app_data_dir,
                &home_dir,
                &skill_dir,
                "GoodNight built-in",
                true,
                true,
                false,
                false,
            )?
        } else {
            build_skill_entry(
                app_data_dir,
                &home_dir,
                &skill_dir,
                "GoodNight recommended",
                is_skill_imported(app_data_dir, &descriptor.id),
                false,
                is_skill_imported(app_data_dir, &descriptor.id),
                false,
            )?
        };
        entries.push(entry);
    }

    for skill_dir in list_skill_directories_recursive(&imported_root)? {
        let descriptor = load_skill_descriptor(&skill_dir, false)?;
        if !seen_skill_ids.insert(descriptor.id.clone()) {
            continue;
        }

        let registry_source = source_registry_entries
            .iter()
            .find(|entry| entry.skill_id == descriptor.id)
            .map(|entry| entry.source.as_str())
            .unwrap_or("GoodNight imported");

        let entry = build_skill_entry(
            app_data_dir,
            &home_dir,
            &skill_dir,
            registry_source,
            true,
            false,
            true,
            true,
        )?;
        entries.push(entry);
    }

    if let Some(project_root) = project_root {
        let project_skill_root = get_project_skill_root(project_root);
        if project_skill_root.is_dir() {
            for skill_dir in list_skill_directories_recursive(&project_skill_root)? {
                let descriptor = load_skill_descriptor(&skill_dir, false)?;
                if !seen_skill_ids.insert(descriptor.id.clone()) {
                    continue;
                }

                let entry = build_skill_entry(
                    app_data_dir,
                    &home_dir,
                    &skill_dir,
                    "Project skill",
                    false,
                    false,
                    false,
                    false,
                )?;
                entries.push(entry);
            }
        }
    }

    for remembered in source_registry_entries {
        if !seen_skill_ids.insert(remembered.skill_id.clone()) {
            continue;
        }

        let remembered_dir = remembered_root.join(&remembered.skill_id);
        if !remembered_dir.is_dir() {
            continue;
        }

        let entry = build_skill_entry(
            app_data_dir,
            &home_dir,
            &remembered_dir,
            &remembered.source,
            false,
            false,
            true,
            true,
        )?;
        entries.push(entry);
    }

    entries.sort_by(|left, right| {
        left.source
            .cmp(&right.source)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(entries)
}

fn build_local_agent_interface_command(
    agent: &str,
    project_root: &str,
) -> Result<(&'static str, String), String> {
    let project_root_arg = escape_powershell_single_quoted(project_root);
    match agent {
        "claude" => Ok(("Claude", "claude".to_string())),
        "codex" => Ok(("Codex", format!("codex --cd '{}'", project_root_arg))),
        _ => Err("Unsupported local agent. Expected claude or codex.".to_string()),
    }
}

fn build_local_agent_prompt_command(
    agent: &str,
    prompt: &str,
) -> Result<(&'static str, &'static str, Vec<String>), String> {
    match agent {
        "claude" => Ok((
            "Claude",
            "claude",
            vec!["-p".to_string(), prompt.to_string()],
        )),
        "codex" => {
            let _command_preview = format!("codex exec {} --output-last-message", prompt);
            Ok((
                "Codex",
                "codex",
                vec![
                    "exec".to_string(),
                    prompt.to_string(),
                    "--output-last-message".to_string(),
                ],
            ))
        }
        _ => Err("Unsupported local agent. Expected claude or codex.".to_string()),
    }
}

#[tauri::command]
fn open_local_agent_interface(params: LocalAgentParams) -> LocalAgentResult {
    let project_root = PathBuf::from(params.project_root.trim());
    if !project_root.is_dir() {
        return LocalAgentResult {
            success: false,
            content: String::new(),
            error: Some("Project root does not exist or is not a directory.".to_string()),
            exit_code: None,
            changed_paths: Vec::new(),
        };
    }

    let project_root_text = project_root.to_string_lossy().to_string();
    let (agent_label, agent_command) =
        match build_local_agent_interface_command(params.agent.trim(), &project_root_text) {
            Ok(command) => command,
            Err(error) => {
                return LocalAgentResult {
                    success: false,
                    content: String::new(),
                    error: Some(error),
                    exit_code: None,
                    changed_paths: Vec::new(),
                }
            }
        };

    let project_root_arg = escape_powershell_single_quoted(&project_root_text);
    let powershell_command = format!(
        "Set-Location -LiteralPath '{}'; {}",
        project_root_arg, agent_command
    );

    #[cfg(target_os = "windows")]
    let launch_result = Command::new("cmd")
        .args([
            "/C",
            "start",
            agent_label,
            "powershell",
            "-NoExit",
            "-Command",
            &powershell_command,
        ])
        .current_dir(&project_root)
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let launch_result = Command::new("sh")
        .args(["-lc", &powershell_command])
        .current_dir(&project_root)
        .spawn();

    match launch_result {
        Ok(_) => LocalAgentResult {
            success: true,
            content: format!("Opened {} CLI in the project directory.", agent_label),
            error: None,
            exit_code: None,
            changed_paths: Vec::new(),
        },
        Err(error) => LocalAgentResult {
            success: false,
            content: String::new(),
            error: Some(format!("Failed to open {} CLI: {}", agent_label, error)),
            exit_code: None,
            changed_paths: Vec::new(),
        },
    }
}

#[tauri::command]
fn run_local_agent_prompt(params: LocalAgentPromptParams) -> LocalAgentResult {
    let project_root = PathBuf::from(params.project_root.trim());
    if !project_root.is_dir() {
        return LocalAgentResult {
            success: false,
            content: String::new(),
            error: Some("Project root does not exist or is not a directory.".to_string()),
            exit_code: None,
            changed_paths: Vec::new(),
        };
    }

    let prompt = params.prompt.trim();
    if prompt.is_empty() {
        return LocalAgentResult {
            success: false,
            content: String::new(),
            error: Some("Prompt cannot be empty.".to_string()),
            exit_code: None,
            changed_paths: Vec::new(),
        };
    }

    let (agent_label, executable, args) =
        match build_local_agent_prompt_command(params.agent.trim(), prompt) {
            Ok(command) => command,
            Err(error) => {
                return LocalAgentResult {
                    success: false,
                    content: String::new(),
                    error: Some(error),
                    exit_code: None,
                    changed_paths: Vec::new(),
                }
            }
        };

    let before_changed_paths = collect_git_status_paths(&project_root);
    let output = Command::new(executable)
        .args(&args)
        .current_dir(&project_root)
        .output();

    match output {
        Ok(result) => {
            let after_changed_paths = collect_git_status_paths(&project_root);
            let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();
            let content = if stdout.is_empty() {
                stderr.clone()
            } else {
                stdout
            };
            let changed_paths = match (before_changed_paths, after_changed_paths) {
                (Some(before), Some(after)) => {
                    let mut paths = after.difference(&before).cloned().collect::<Vec<String>>();
                    paths.sort();
                    paths
                }
                _ => Vec::new(),
            };

            if result.status.success() {
                LocalAgentResult {
                    success: true,
                    content,
                    error: None,
                    exit_code: result.status.code(),
                    changed_paths,
                }
            } else {
                LocalAgentResult {
                    success: false,
                    content,
                    error: Some(if stderr.is_empty() {
                        format!("{} exited with a non-zero status.", agent_label)
                    } else {
                        stderr
                    }),
                    exit_code: result.status.code(),
                    changed_paths: Vec::new(),
                }
            }
        }
        Err(error) => LocalAgentResult {
            success: false,
            content: String::new(),
            error: Some(format!(
                "Failed to run {} prompt command: {}",
                agent_label, error
            )),
            exit_code: None,
            changed_paths: Vec::new(),
        },
    }
}

#[tauri::command]
fn get_local_agent_config_snapshot() -> Result<LocalAgentConfigSnapshot, String> {
    let home_dir = resolve_home_dir()?;
    let claude_home = home_dir.join(".claude");
    let codex_home = home_dir.join(".codex");

    Ok(LocalAgentConfigSnapshot {
        home_dir: home_dir.to_string_lossy().to_string(),
        claude_home: build_local_config_probe(claude_home.clone(), false),
        claude_settings: build_local_config_probe(claude_home.join("settings.json"), false),
        claude_commands: build_local_config_probe(claude_home.join("commands"), false),
        claude_plugins: build_local_config_probe(claude_home.join("plugins"), false),
        codex_home: build_local_config_probe(codex_home.clone(), false),
        codex_skills: build_local_config_probe(codex_home.join("skills"), false),
        codex_agents: build_local_config_probe(codex_home.join("agents"), false),
    })
}

#[tauri::command]
fn discover_local_skills(
    app_handle: tauri::AppHandle,
    params: Option<DiscoverLocalSkillsParams>,
) -> Result<Vec<SkillDiscoveryEntry>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;

    let project_root = params
        .and_then(|value| value.project_root)
        .map(|value| PathBuf::from(value.trim()))
        .filter(|value| !value.as_os_str().is_empty());

    collect_skill_discovery_entries(&app_data_dir, project_root.as_deref())
}

#[tauri::command]
fn import_local_skill(
    app_handle: tauri::AppHandle,
    params: ImportLocalSkillParams,
) -> Result<SkillDiscoveryEntry, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;
    ensure_builtin_skills_installed(&app_data_dir)?;

    let source_path = PathBuf::from(params.source_path.trim());
    if !source_path.exists() {
        return Err(format!(
            "Skill source path does not exist: {}",
            source_path.display()
        ));
    }

    let imported_root = get_goodnight_imported_skill_root_from_data_dir(&app_data_dir);
    let builtin_root = get_goodnight_builtin_skill_root_from_data_dir(&app_data_dir);
    let remembered_root = get_goodnight_remembered_skill_root_from_data_dir(&app_data_dir);
    fs::create_dir_all(&imported_root)
        .map_err(|error| format!("Failed to create imported skills directory: {}", error))?;

    let target_dir = if source_path.is_dir() {
        let descriptor = load_skill_descriptor(&source_path, false)?;
        let target_dir = imported_root.join(&descriptor.id);
        copy_directory_contents(&source_path, &target_dir)?;
        target_dir
    } else {
        let prompt_source = read_file_as_string(&source_path).map_err(|error| {
            format!(
                "Failed to read skill source {}: {}",
                source_path.display(),
                error
            )
        })?;
        let (frontmatter_name, _) = parse_skill_frontmatter(&prompt_source);
        let file_stem = source_path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "skill".to_string());
        let skill_id = sanitize_skill_id(&file_stem);
        let skill_name = frontmatter_name.unwrap_or_else(|| humanize_skill_id(&skill_id));
        let target_dir = imported_root.join(&skill_id);
        fs::create_dir_all(&target_dir).map_err(|error| {
            format!(
                "Failed to create imported skill directory {}: {}",
                target_dir.display(),
                error
            )
        })?;

        fs::write(
            target_dir.join(GOODNIGHT_SKILL_MARKDOWN_FILE_NAME),
            prompt_source,
        )
        .map_err(|error| {
            format!(
                "Failed to write imported skill prompt {}: {}",
                target_dir
                    .join(GOODNIGHT_SKILL_MARKDOWN_FILE_NAME)
                    .display(),
                error
            )
        })?;

        let manifest = generate_skill_manifest(&skill_id, &skill_name, "imported");
        let manifest_source = serde_json::to_string_pretty(&manifest).map_err(|error| {
            format!("Failed to serialize generated imported manifest: {}", error)
        })?;
        fs::write(
            target_dir.join(GOODNIGHT_SKILL_MANIFEST_FILE_NAME),
            manifest_source,
        )
        .map_err(|error| {
            format!(
                "Failed to write imported skill manifest {}: {}",
                target_dir
                    .join(GOODNIGHT_SKILL_MANIFEST_FILE_NAME)
                    .display(),
                error
            )
        })?;

        target_dir
    };

    let home_dir = resolve_home_dir()?;
    let entry = build_skill_entry(
        &app_data_dir,
        &home_dir,
        &target_dir,
        "GoodNight imported",
        true,
        false,
        true,
        true,
    )?;

    let source_is_builtin_seed = path_stays_under_root(&source_path, &builtin_root);
    if !source_is_builtin_seed {
        let existing_registry_entry = read_skill_source_registry(&app_data_dir)?
            .into_iter()
            .find(|registry_entry| registry_entry.skill_id == entry.id);
        let source_label = existing_registry_entry
            .as_ref()
            .map(|registry_entry| registry_entry.source.as_str())
            .unwrap_or("GoodNight imported");
        let source_reference = if path_stays_under_root(&source_path, &remembered_root) {
            existing_registry_entry
                .as_ref()
                .map(|registry_entry| registry_entry.source_path.as_str())
                .unwrap_or("remembered://skill-library")
                .to_string()
        } else {
            display_project_storage_path(source_path.clone())
        };

        remember_personal_skill_snapshot(
            &app_data_dir,
            &target_dir,
            source_label,
            source_reference.as_str(),
        )?;
    }

    Ok(entry)
}

#[tauri::command]
fn import_github_skill(
    app_handle: tauri::AppHandle,
    params: ImportGithubSkillParams,
) -> Result<SkillDiscoveryEntry, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;
    ensure_builtin_skills_installed(&app_data_dir)?;

    let repo = params.repo.trim();
    if repo.is_empty() || !repo.contains('/') {
        return Err("GitHub repo must use the owner/repo format.".to_string());
    }

    let skill_path = params.path.trim().trim_matches('/');
    if skill_path.is_empty() {
        return Err("GitHub skill path cannot be empty.".to_string());
    }

    let git_ref = params
        .git_ref
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("main");
    let contents_url = format!(
        "https://api.github.com/repos/{}/contents/{}?ref={}",
        repo, skill_path, git_ref
    );

    let imported_root = get_goodnight_imported_skill_root_from_data_dir(&app_data_dir);
    fs::create_dir_all(&imported_root)
        .map_err(|error| format!("Failed to create imported skills directory: {}", error))?;

    let temp_dir = build_github_skill_download_temp_dir(&app_data_dir);
    let client = github_client()?;
    download_github_contents(&client, &contents_url, &temp_dir)?;

    if !temp_dir.join(GOODNIGHT_SKILL_MARKDOWN_FILE_NAME).is_file() {
        return Err(format!(
            "Imported GitHub directory does not contain {} at its root.",
            GOODNIGHT_SKILL_MARKDOWN_FILE_NAME
        ));
    }

    let descriptor = load_skill_descriptor(&temp_dir, true)?;
    let target_dir = imported_root.join(&descriptor.id);
    copy_directory_contents(&temp_dir, &target_dir)?;
    let _ = fs::remove_dir_all(&temp_dir);

    let home_dir = resolve_home_dir()?;
    let entry = build_skill_entry(
        &app_data_dir,
        &home_dir,
        &target_dir,
        format!("GitHub {}", repo).as_str(),
        true,
        false,
        true,
        true,
    )?;

    remember_personal_skill_snapshot(
        &app_data_dir,
        &target_dir,
        format!("GitHub {}", repo).as_str(),
        format!("github:{}/{}?ref={}", repo, skill_path, git_ref).as_str(),
    )?;

    Ok(entry)
}

#[tauri::command]
fn sync_skill_to_runtime(
    app_handle: tauri::AppHandle,
    params: SyncSkillToRuntimeParams,
) -> Result<SkillRuntimeSyncResult, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;
    ensure_builtin_skills_installed(&app_data_dir)?;

    let skill_id = sanitize_skill_id(params.skill_id.trim());
    if skill_id.is_empty() {
        return Err("Skill id cannot be empty.".to_string());
    }

    let source_dir = find_library_skill_dir(&app_data_dir, &skill_id)
        .ok_or_else(|| format!("Skill {} is not installed in GoodNight.", skill_id))?;
    let source_prompt_path = source_dir.join(GOODNIGHT_SKILL_MARKDOWN_FILE_NAME);
    let home_dir = resolve_home_dir()?;

    let target_path = match params.runtime {
        SkillRuntimeTarget::Codex => {
            let target_dir = home_dir.join(".codex").join("skills").join(&skill_id);
            copy_directory_contents(&source_dir, &target_dir)?;
            target_dir
        }
        SkillRuntimeTarget::Claude => {
            let command_path = get_claude_command_path(&home_dir, &skill_id);
            let plugin_dir = get_claude_plugin_skill_dir(&home_dir, &skill_id);
            fs::create_dir_all(
                command_path
                    .parent()
                    .ok_or_else(|| "Failed to resolve Claude commands directory.".to_string())?,
            )
            .map_err(|error| format!("Failed to create Claude commands directory: {}", error))?;
            copy_directory_contents(&source_dir, &plugin_dir)?;
            let prompt_source = read_file_as_string(&source_prompt_path).map_err(|error| {
                format!(
                    "Failed to read GoodNight skill prompt {}: {}",
                    source_prompt_path.display(),
                    error
                )
            })?;
            fs::write(&command_path, prompt_source).map_err(|error| {
                format!(
                    "Failed to write Claude command {}: {}",
                    command_path.display(),
                    error
                )
            })?;
            command_path
        }
    };

    Ok(SkillRuntimeSyncResult {
        skill_id,
        runtime: params.runtime,
        target_path: display_project_storage_path(target_path),
        synced: true,
    })
}

#[tauri::command]
fn uninstall_library_skill(
    app_handle: tauri::AppHandle,
    params: DeleteLibrarySkillParams,
) -> Result<SkillDeleteResult, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;
    ensure_builtin_skills_installed(&app_data_dir)?;

    let skill_id = sanitize_skill_id(params.skill_id.trim());
    if skill_id.is_empty() {
        return Err("Skill id cannot be empty.".to_string());
    }

    let builtin_dir = get_goodnight_builtin_skill_root_from_data_dir(&app_data_dir).join(&skill_id);
    if builtin_dir.is_dir() {
        let descriptor = load_skill_descriptor(&builtin_dir, false)?;
        if is_system_skill(&descriptor.category) {
            return Err("Built-in skills cannot be uninstalled.".to_string());
        }
    }

    let imported_dir =
        get_goodnight_imported_skill_root_from_data_dir(&app_data_dir).join(&skill_id);
    if !imported_dir.is_dir() {
        return Err("Only installed GoodNight skills can be uninstalled.".to_string());
    }

    if !builtin_dir.is_dir() {
        let existing_registry_entry = read_skill_source_registry(&app_data_dir)?
            .into_iter()
            .find(|registry_entry| registry_entry.skill_id == skill_id);
        let source_label = existing_registry_entry
            .as_ref()
            .map(|registry_entry| registry_entry.source.as_str())
            .unwrap_or("GoodNight imported");
        let source_reference = existing_registry_entry
            .as_ref()
            .map(|registry_entry| registry_entry.source_path.as_str())
            .unwrap_or("remembered://skill-library");

        remember_personal_skill_snapshot(
            &app_data_dir,
            &imported_dir,
            source_label,
            source_reference,
        )?;
    }

    fs::remove_dir_all(&imported_dir).map_err(|error| {
        format!(
            "Failed to uninstall skill {}: {}",
            imported_dir.display(),
            error
        )
    })?;

    Ok(SkillDeleteResult {
        skill_id,
        deleted_path: display_project_storage_path(imported_dir),
        deleted: true,
    })
}

#[tauri::command]
fn delete_library_skill(
    app_handle: tauri::AppHandle,
    params: DeleteLibrarySkillParams,
) -> Result<SkillDeleteResult, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;
    ensure_builtin_skills_installed(&app_data_dir)?;

    let skill_id = sanitize_skill_id(params.skill_id.trim());
    if skill_id.is_empty() {
        return Err("Skill id cannot be empty.".to_string());
    }

    let builtin_dir = get_goodnight_builtin_skill_root_from_data_dir(&app_data_dir).join(&skill_id);
    if builtin_dir.is_dir() {
        let descriptor = load_skill_descriptor(&builtin_dir, false)?;
        if is_system_skill(&descriptor.category) {
            return Err("Built-in skills cannot be deleted.".to_string());
        }

        return Err("Recommended system skills can only be uninstalled.".to_string());
    }

    let remembered_dir =
        get_goodnight_remembered_skill_root_from_data_dir(&app_data_dir).join(&skill_id);
    let imported_dir =
        get_goodnight_imported_skill_root_from_data_dir(&app_data_dir).join(&skill_id);
    if !imported_dir.is_dir() && !remembered_dir.is_dir() {
        return Err("Only imported GoodNight skills can be deleted.".to_string());
    }

    if imported_dir.is_dir() {
        fs::remove_dir_all(&imported_dir).map_err(|error| {
            format!(
                "Failed to delete skill {}: {}",
                imported_dir.display(),
                error
            )
        })?;
    }

    if remembered_dir.is_dir() {
        fs::remove_dir_all(&remembered_dir).map_err(|error| {
            format!(
                "Failed to delete remembered skill snapshot {}: {}",
                remembered_dir.display(),
                error
            )
        })?;
    }

    remove_skill_source_registry_entry(&app_data_dir, &skill_id)?;

    let deleted_path = if remembered_dir.exists() {
        display_project_storage_path(remembered_dir)
    } else {
        display_project_storage_path(imported_dir)
    };

    Ok(SkillDeleteResult {
        skill_id,
        deleted_path,
        deleted: true,
    })
}

// View tool - read file contents with line numbers
#[tauri::command]
fn tool_view(params: ViewParams) -> ToolResult {
    if let Err(result) = ensure_project_path(params.project_root.as_ref(), &params.file_path) {
        return result;
    }

    let file_path = Path::new(&params.file_path);

    if !file_path.exists() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("File not found: {}", params.file_path)),
        };
    }

    if file_path.is_dir() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!(
                "Path is a directory, not a file: {}",
                params.file_path
            )),
        };
    }

    let content = match read_file_as_string(file_path) {
        Ok(c) => c,
        Err(e) => {
            return ToolResult {
                success: false,
                content: String::new(),
                error: Some(format!("Error reading file: {}", e)),
            }
        }
    };

    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(2000);

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    let start = offset.min(total_lines);
    let end = (offset + limit).min(total_lines);

    let mut result = String::from("<file>\n");
    for (i, line) in lines[start..end].iter().enumerate() {
        let line_num = start + i + 1;
        result.push_str(&format!("{:6}|{}\n", line_num, line));
    }
    result.push_str("</file>\n");

    if end < total_lines {
        result.push_str(&format!(
            "\n(File has {} more lines. Use 'offset' to read more.)\n",
            total_lines - end
        ));
    }

    ToolResult {
        success: true,
        content: result,
        error: None,
    }
}

// Write tool - create or overwrite file
#[tauri::command]
fn tool_write(params: WriteParams) -> ToolResult {
    if let Err(result) = ensure_project_path(params.project_root.as_ref(), &params.file_path) {
        return result;
    }

    let file_path = Path::new(&params.file_path);

    // Create parent directories if they don't exist
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return ToolResult {
                    success: false,
                    content: String::new(),
                    error: Some(format!("Error creating directory: {}", e)),
                };
            }
        }
    }

    // Write file
    match fs::write(file_path, &params.content) {
        Ok(_) => ToolResult {
            success: true,
            content: format!("File successfully written: {}", params.file_path),
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            content: String::new(),
            error: Some(format_write_error(&params.file_path, &e)),
        },
    }
}

#[tauri::command]
fn tool_remove(params: RemoveParams) -> ToolResult {
    if let Err(result) = ensure_project_path(params.project_root.as_ref(), &params.file_path) {
        return result;
    }

    let file_path = Path::new(&params.file_path);

    if !file_path.exists() {
        return ToolResult {
            success: true,
            content: format!("File already removed: {}", params.file_path),
            error: None,
        };
    }

    let result = if file_path.is_dir() {
        fs::remove_dir_all(file_path)
    } else {
        fs::remove_file(file_path)
    };

    match result {
        Ok(_) => ToolResult {
            success: true,
            content: format!("Removed: {}", params.file_path),
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Error removing path: {}", e)),
        },
    }
}

#[tauri::command]
fn tool_mkdir(params: RemoveParams) -> ToolResult {
    if let Err(result) = ensure_project_path(params.project_root.as_ref(), &params.file_path) {
        return result;
    }

    let dir_path = Path::new(&params.file_path);

    match fs::create_dir_all(dir_path) {
        Ok(_) => ToolResult {
            success: true,
            content: format!("Directory created: {}", params.file_path),
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Error creating directory: {}", e)),
        },
    }
}

#[tauri::command]
fn tool_rename(params: RenameParams) -> ToolResult {
    if let Err(result) = ensure_project_path(params.project_root.as_ref(), &params.from_path) {
        return result;
    }
    if let Err(result) = ensure_project_path(params.project_root.as_ref(), &params.to_path) {
        return result;
    }

    let from_path = Path::new(&params.from_path);
    let to_path = Path::new(&params.to_path);

    if !from_path.exists() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Source path not found: {}", params.from_path)),
        };
    }

    if let Some(parent) = to_path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return ToolResult {
                    success: false,
                    content: String::new(),
                    error: Some(format!("Error creating target directory: {}", e)),
                };
            }
        }
    }

    match fs::rename(from_path, to_path) {
        Ok(_) => ToolResult {
            success: true,
            content: format!("Renamed: {} -> {}", params.from_path, params.to_path),
            error: None,
        },
        Err(rename_error) => {
            let fallback_result = if from_path.is_dir() {
                copy_dir_all(from_path, to_path).and_then(|_| fs::remove_dir_all(from_path))
            } else {
                fs::copy(from_path, to_path)
                    .map(|_| ())
                    .and_then(|_| fs::remove_file(from_path))
            };

            match fallback_result {
                Ok(_) => ToolResult {
                    success: true,
                    content: format!(
                        "Moved with fallback: {} -> {}",
                        params.from_path, params.to_path
                    ),
                    error: None,
                },
                Err(fallback_error) => ToolResult {
                    success: false,
                    content: String::new(),
                    error: Some(format!(
                        "Error renaming path: {}. Fallback move failed: {}",
                        rename_error, fallback_error
                    )),
                },
            }
        }
    }
}

fn copy_dir_all(from_path: &Path, to_path: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to_path)?;
    for entry in fs::read_dir(from_path)? {
        let entry = entry?;
        let entry_type = entry.file_type()?;
        let target_path = to_path.join(entry.file_name());
        if entry_type.is_dir() {
            copy_dir_all(&entry.path(), &target_path)?;
        } else {
            fs::copy(entry.path(), target_path)?;
        }
    }
    Ok(())
}

// Edit tool - replace old_string with new_string in file
#[tauri::command]
fn tool_edit(params: EditParams) -> ToolResult {
    if let Err(result) = ensure_project_path(params.project_root.as_ref(), &params.file_path) {
        return result;
    }

    let file_path = Path::new(&params.file_path);

    if !file_path.exists() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("File not found: {}", params.file_path)),
        };
    }

    let content = match read_file_as_string(file_path) {
        Ok(c) => c,
        Err(e) => {
            return ToolResult {
                success: false,
                content: String::new(),
                error: Some(format!("Error reading file: {}", e)),
            }
        }
    };

    if !content.contains(&params.old_string) {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("old_string not found in file. Please ensure you provide the exact text to replace.")),
        };
    }

    let new_content = content.replace(&params.old_string, &params.new_string);

    match fs::write(file_path, &new_content) {
        Ok(_) => ToolResult {
            success: true,
            content: format!("File successfully edited: {}", params.file_path),
            error: None,
        },
        Err(e) => ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Error writing file: {}", e)),
        },
    }
}

// LS tool - list directory contents
#[tauri::command]
fn tool_ls(params: LsParams) -> ToolResult {
    let path = params.path.as_deref().unwrap_or(".");
    let dir_path = Path::new(path);

    if !dir_path.exists() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Directory not found: {}", path)),
        };
    }

    if !dir_path.is_dir() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Path is not a directory: {}", path)),
        };
    }

    let mut entries: Vec<String> = Vec::new();

    match fs::read_dir(dir_path) {
        Ok(read_dir) => {
            for entry in read_dir {
                if let Ok(entry) = entry {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let file_type = entry.file_type();
                    if file_type.map(|ft| ft.is_dir()).unwrap_or(false) {
                        entries.push(format!("{}/", name));
                    } else {
                        entries.push(name);
                    }
                }
            }
        }
        Err(e) => {
            return ToolResult {
                success: false,
                content: String::new(),
                error: Some(format!("Error reading directory: {}", e)),
            }
        }
    }

    entries.sort();

    ToolResult {
        success: true,
        content: entries.join("\n"),
        error: None,
    }
}

// Glob tool - simple pattern matching (not full glob implementation)
#[tauri::command]
fn tool_glob(params: GlobParams) -> ToolResult {
    let path = params.path.as_deref().unwrap_or(".");
    let dir_path = Path::new(path);

    if !dir_path.exists() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Directory not found: {}", path)),
        };
    }

    let pattern = params.pattern.to_lowercase();
    let mut matches: Vec<String> = Vec::new();

    fn walk_dir(dir: &Path, pattern: &str, matches: &mut Vec<String>, depth: usize) {
        if depth > 10 {
            return;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                let path = entry.path();

                // Check if matches pattern
                let matches_pattern = if pattern.contains('*') {
                    let regex_pattern = pattern
                        .replace(".", "\\.")
                        .replace("**/", ".*/")
                        .replace("**", ".*")
                        .replace("*", "[^/]*");
                    if let Ok(re) = regex::Regex::new(&regex_pattern) {
                        re.is_match(&name)
                    } else {
                        name.contains(&pattern.replace('*', ""))
                    }
                } else {
                    name.contains(&pattern)
                };

                if matches_pattern {
                    matches.push(display_project_storage_path(path.clone()));
                }

                // Recurse into directories
                if path.is_dir() && !name.starts_with('.') {
                    walk_dir(&path, pattern, matches, depth + 1);
                }
            }
        }
    }

    walk_dir(dir_path, &pattern, &mut matches, 0);

    matches.sort();
    matches.dedup();

    if matches.is_empty() {
        ToolResult {
            success: true,
            content: format!(
                "No files matching pattern '{}' found in {}",
                params.pattern, path
            ),
            error: None,
        }
    } else {
        ToolResult {
            success: true,
            content: matches.join("\n"),
            error: None,
        }
    }
}

// Grep tool - search for pattern in files
#[tauri::command]
fn tool_grep(params: GrepParams) -> ToolResult {
    use std::io::{BufRead, BufReader};

    let path = params.path.as_deref().unwrap_or(".");
    let dir_path = Path::new(path);

    if !dir_path.exists() {
        return ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Directory not found: {}", path)),
        };
    }

    let pattern = &params.pattern;
    let include = params.include.as_deref();
    let mut matches: Vec<String> = Vec::new();

    fn search_in_dir(
        dir: &Path,
        pattern: &str,
        include: Option<&str>,
        matches: &mut Vec<String>,
        depth: usize,
    ) {
        if depth > 10 {
            return;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy();

                // Skip hidden files
                if name.starts_with('.') {
                    continue;
                }

                if path.is_dir() {
                    search_in_dir(&path, pattern, include, matches, depth + 1);
                } else if path.is_file() {
                    // Check include filter
                    if let Some(inc) = include {
                        let inc_lower = inc.to_lowercase();
                        let name_lower = name.to_lowercase();
                        let matches_inc = if inc_lower.contains('*') {
                            let regex_pattern = inc_lower
                                .replace(".", "\\.")
                                .replace("**/", ".*/")
                                .replace("**", ".*")
                                .replace("*", "[^/]*");
                            regex::Regex::new(&regex_pattern)
                                .map(|re| re.is_match(&name_lower))
                                .unwrap_or(false)
                        } else {
                            name_lower.ends_with(&inc_lower.replace("*", ""))
                        };
                        if !matches_inc {
                            continue;
                        }
                    }

                    // Search in file
                    if let Ok(file) = fs::File::open(&path) {
                        let reader = BufReader::new(file);
                        for (line_num, line) in reader.lines().enumerate() {
                            if let Ok(line) = line {
                                if line.contains(pattern) {
                                    matches.push(format!(
                                        "{}:{}:{}",
                                        path.display(),
                                        line_num + 1,
                                        line
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    search_in_dir(dir_path, pattern, include, &mut matches, 0);

    if matches.is_empty() {
        ToolResult {
            success: true,
            content: format!("No files found matching '{}' in {}", pattern, path),
            error: None,
        }
    } else {
        ToolResult {
            success: true,
            content: matches.join("\n"),
            error: None,
        }
    }
}

// Bash tool - execute shell commands
#[cfg(target_os = "windows")]
fn run_shell_command(
    command: &str,
    shell: Option<&str>,
    cwd: Option<&String>,
    timeout: Option<u64>,
) -> std::io::Result<Output> {
    let shell = shell.unwrap_or("powershell").to_lowercase();
    if shell == "powershell" {
        run_windows_powershell_command(command, cwd, timeout)
    } else {
        let mut process = Command::new("cmd");
        process.arg("/C").arg(command);
        if let Some(cwd) = cwd {
            process.current_dir(cwd);
        }
        run_command_with_timeout(process, timeout)
    }
}

#[cfg(not(target_os = "windows"))]
fn run_shell_command(
    command: &str,
    shell: Option<&str>,
    cwd: Option<&String>,
    timeout: Option<u64>,
) -> std::io::Result<Output> {
    let shell = shell.unwrap_or("bash").to_lowercase();
    let mut process = if shell == "powershell" {
        let mut command_process = Command::new("pwsh");
        command_process
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(command);
        command_process
    } else if shell == "sh" {
        let mut command_process = Command::new("sh");
        command_process.arg("-c").arg(command);
        command_process
    } else {
        let mut command_process = Command::new("bash");
        command_process.arg("-lc").arg(command);
        command_process
    };

    if let Some(cwd) = cwd {
        process.current_dir(cwd);
    }

    run_command_with_timeout(process, timeout)
}

#[tauri::command]
fn tool_bash(params: BashParams) -> ToolResult {
    let command = &params.command;
    if let Some(cwd) = params.cwd.as_ref() {
        if let Err(result) = ensure_project_path(params.project_root.as_ref(), cwd) {
            return result;
        }
    }

    // Basic security check - block dangerous commands
    let dangerous = ["rm -rf /", "mkfs", "dd if="];
    for d in dangerous {
        if command.contains(d) {
            return ToolResult {
                success: false,
                content: String::new(),
                error: Some(format!("Command not allowed for security reasons")),
            };
        }
    }

    let output = run_shell_command(
        command,
        params.shell.as_deref(),
        params.cwd.as_ref(),
        params.timeout,
    );

    match output {
        Ok(out) => {
            let stdout = decode_command_output(&out.stdout);
            let stderr = decode_command_output(&out.stderr);

            if out.status.success() {
                ToolResult {
                    success: true,
                    content: stdout,
                    error: None,
                }
            } else {
                ToolResult {
                    success: false,
                    content: stdout,
                    error: Some(stderr),
                }
            }
        }
        Err(e) => ToolResult {
            success: false,
            content: String::new(),
            error: Some(format!("Error executing command: {}", e)),
        },
    }
}

#[tauri::command]
fn get_project_storage_settings(
    app_handle: tauri::AppHandle,
) -> Result<ProjectStorageSettings, String> {
    build_project_storage_settings(&app_handle)
}

#[tauri::command]
fn set_project_storage_root(
    app_handle: tauri::AppHandle,
    root_path: Option<String>,
) -> Result<ProjectStorageSettings, String> {
    let default_path = get_default_projects_root_path(&app_handle)?;
    let normalized_root = normalize_project_storage_root_path(root_path)?;
    let stored_root = normalized_root
        .filter(|path| path != &default_path)
        .map(display_project_storage_path);

    if let Some(path) = stored_root.as_ref() {
        fs::create_dir_all(path)
            .map_err(|e| format!("Failed to create selected projects directory: {}", e))?;
    }

    write_project_storage_settings_payload(
        &app_handle,
        &ProjectStorageSettingsPayload {
            root_path: stored_root,
        },
    )?;

    build_project_storage_settings(&app_handle)
}

#[tauri::command]
fn get_requirements_dir(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<String, String> {
    let dir_path: PathBuf = get_projects_root_path(&app_handle)?
        .join(project_id)
        .join("requirements");

    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Failed to create requirements directory: {}", e))?;

    dir_path
        .canonicalize()
        .map(display_project_storage_path)
        .or_else(|_| Ok(display_project_storage_path(dir_path)))
}

#[tauri::command]
fn get_project_dir(app_handle: tauri::AppHandle, project_id: String) -> Result<String, String> {
    let dir_path: PathBuf = get_projects_root_path(&app_handle)?.join(project_id);

    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    dir_path
        .canonicalize()
        .map(display_project_storage_path)
        .or_else(|_| Ok(display_project_storage_path(dir_path)))
}

#[tauri::command]
fn get_projects_index_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let file_path = get_projects_root_path(&app_handle)?.join("index.json");

    if !file_path.exists() {
        fs::write(&file_path, "[]")
            .map_err(|e| format!("Failed to initialize projects index: {}", e))?;
    }

    file_path
        .canonicalize()
        .map(display_project_storage_path)
        .or_else(|_| Ok(display_project_storage_path(file_path)))
}

fn build_unique_destination_path(target_dir: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let candidate = PathBuf::from(file_name);
    let stem = candidate
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "asset".to_string());
    let extension = candidate
        .extension()
        .map(|value| value.to_string_lossy().to_string());

    let mut next_path = target_dir.join(file_name);
    if !next_path.exists() {
        return next_path;
    }

    for index in 1..10_000 {
        let suffix = format!("{stem}-{index}");
        next_path = match &extension {
            Some(extension) if !extension.is_empty() => {
                target_dir.join(format!("{suffix}.{extension}"))
            }
            _ => target_dir.join(&suffix),
        };

        if !next_path.exists() {
            return next_path;
        }
    }

    target_dir.join(file_name)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportKnowledgeAssetsParams {
    project_root: String,
    target_directory: String,
    source_paths: Vec<String>,
}

#[tauri::command]
fn import_knowledge_assets(params: ImportKnowledgeAssetsParams) -> Result<Vec<String>, String> {
    let project_root = fs::canonicalize(params.project_root.trim())
        .map_err(|error| format!("Failed to resolve project root: {}", error))?;
    let requested_target_dir = PathBuf::from(params.target_directory.trim());

    fs::create_dir_all(&requested_target_dir)
        .map_err(|error| format!("Failed to create target directory: {}", error))?;

    let target_directory = fs::canonicalize(&requested_target_dir)
        .map_err(|error| format!("Failed to resolve target directory: {}", error))?;

    if !target_directory.starts_with(&project_root) {
        return Err("Target directory must stay inside the current project.".to_string());
    }

    let mut imported_paths = Vec::new();
    for source_path in params.source_paths {
        let source = PathBuf::from(source_path.trim());
        if !source.is_file() {
            return Err(format!("Source file does not exist: {}", source.display()));
        }

        let file_name = source
            .file_name()
            .ok_or_else(|| format!("Invalid source file name: {}", source.display()))?;
        let destination = build_unique_destination_path(&target_directory, file_name);
        fs::copy(&source, &destination).map_err(|error| {
            format!(
                "Failed to copy {} to {}: {}",
                source.display(),
                destination.display(),
                error
            )
        })?;
        imported_paths.push(display_project_storage_path(destination));
    }

    Ok(imported_paths)
}

#[tauri::command]
fn read_text_file(file_path: String) -> Result<String, String> {
    read_file_as_string(Path::new(&file_path)).map_err(|e| format!("Error reading file: {}", e))
}

#[tauri::command]
fn open_path_in_shell(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let target_path = PathBuf::from(path.trim());
    if !target_path.exists() {
        return Err(format!("Path does not exist: {}", target_path.display()));
    }

    #[allow(deprecated)]
    app_handle
        .shell()
        .open(target_path.to_string_lossy().to_string(), None)
        .map_err(|error| format!("Failed to open path: {}", error))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "goodnight_lib=info,goodnight_core=info,warn"
                    .parse()
                    .unwrap()
            }),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(RuntimeSidecarManager::default())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;

            fs::create_dir_all(&app_data_dir)
                .map_err(|error| format!("Failed to create app data directory: {}", error))?;
            ensure_builtin_skills_installed(&app_data_dir)?;

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                window.set_shadow(false).ok();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tool_view,
            tool_write,
            tool_remove,
            tool_rename,
            tool_mkdir,
            tool_edit,
            tool_ls,
            tool_glob,
            tool_grep,
            tool_bash,
            get_project_storage_settings,
            set_project_storage_root,
            get_requirements_dir,
            get_project_dir,
            get_projects_index_path,
            open_local_agent_interface,
            run_local_agent_prompt,
            get_local_agent_config_snapshot,
            discover_local_skills,
            import_local_skill,
            import_github_skill,
            sync_skill_to_runtime,
            uninstall_library_skill,
            delete_library_skill,
            create_agent_shell_session,
            list_agent_shell_sessions,
            get_agent_shell_settings,
            update_agent_shell_settings,
            create_agent_thread,
            list_agent_threads,
            append_agent_timeline_event,
            enqueue_agent_approval,
            resolve_agent_approval,
            list_agent_approvals,
            get_agent_sandbox_policy,
            set_agent_sandbox_policy,
            get_agent_runtime_settings,
            update_agent_runtime_settings,
            list_runtime_mcp_servers,
            upsert_runtime_mcp_server,
            delete_runtime_mcp_server,
            list_runtime_mcp_tool_calls,
            invoke_runtime_mcp_tool,
            append_runtime_replay_event,
            list_runtime_replay_events,
            save_project_memory_entry,
            list_project_memory_entries,
            save_agent_turn_checkpoint,
            list_agent_turn_checkpoints,
            get_agent_turn_checkpoint_diff,
            rewind_agent_turn,
            upsert_agent_background_task,
            list_agent_background_tasks,
            import_knowledge_assets,
            read_text_file,
            open_path_in_shell,
            start_runtime_sidecar,
            get_runtime_sidecar_status,
            stop_runtime_sidecar,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::{
        display_project_storage_path, normalize_project_storage_root_path,
        normalize_saved_project_storage_root_path, path_stays_under_root,
        resolve_project_storage_root_path,
    };
    use std::path::PathBuf;

    #[test]
    fn project_storage_root_normalizer_treats_blank_as_default() {
        assert_eq!(
            normalize_project_storage_root_path(Some("   ".into())).unwrap(),
            None
        );
        assert_eq!(normalize_project_storage_root_path(None).unwrap(), None);
    }

    #[test]
    fn project_storage_root_normalizer_rejects_relative_paths() {
        let error =
            normalize_project_storage_root_path(Some("projects/custom".into())).unwrap_err();
        assert!(error.contains("absolute path"));
    }

    #[test]
    fn project_storage_root_resolver_uses_override_only_when_it_differs_from_default() {
        let default_path = PathBuf::from("C:/Users/test/Documents/GoodNight/projects");
        let override_path = PathBuf::from("D:/GoodNight/projects");

        assert_eq!(
            resolve_project_storage_root_path(default_path.clone(), Some(default_path.clone())),
            (default_path.clone(), true)
        );
        assert_eq!(
            resolve_project_storage_root_path(default_path.clone(), Some(override_path.clone())),
            (override_path, false)
        );
        assert_eq!(
            resolve_project_storage_root_path(default_path.clone(), None),
            (default_path, true)
        );
    }

    #[test]
    fn project_tool_boundary_rejects_paths_outside_root() {
        let root = PathBuf::from("C:/repo/demo");

        assert!(path_stays_under_root(
            &PathBuf::from("C:/repo/demo/docs/spec.md"),
            &root
        ));
        assert!(!path_stays_under_root(
            &PathBuf::from("C:/repo/demo/../secret.txt"),
            &root
        ));
        assert!(!path_stays_under_root(
            &PathBuf::from("C:/repo-other/demo.txt"),
            &root
        ));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn saved_project_storage_root_ignores_posix_path_on_windows() {
        assert_eq!(
            normalize_saved_project_storage_root_path(Some(
                "/Users/test/GoodNight/projects".into()
            ))
            .unwrap(),
            None
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn saved_project_storage_root_ignores_windows_path_on_posix() {
        assert_eq!(
            normalize_saved_project_storage_root_path(Some(
                "C:/Users/test/Documents/GoodNight/projects".into()
            ))
            .unwrap(),
            None
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn display_project_storage_path_hides_windows_extended_length_prefix() {
        assert_eq!(
            display_project_storage_path(PathBuf::from(
                r"\\?\C:\Users\test\Documents\GoodNight\projects"
            )),
            r"C:\Users\test\Documents\GoodNight\projects"
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn display_project_storage_path_keeps_posix_paths_unchanged() {
        assert_eq!(
            display_project_storage_path(PathBuf::from("/Users/test/GoodNight/projects")),
            "/Users/test/GoodNight/projects"
        );
    }
}
