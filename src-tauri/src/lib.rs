// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

fn read_file_as_string(file_path: &Path) -> std::io::Result<String> {
    let bytes = fs::read(file_path)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ViewParams {
    pub file_path: String,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteParams {
    pub file_path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditParams {
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
    pub command: String,
    pub timeout: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoveParams {
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentParams {
    pub agent: String,
    pub project_root: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentResult {
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
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

fn normalize_project_storage_root_path(root_path: Option<String>) -> Result<Option<PathBuf>, String> {
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

fn normalize_saved_project_storage_root_path(root_path: Option<String>) -> Result<Option<PathBuf>, String> {
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
        .map(|path| path.join("DevFlow").join("projects"))
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

fn build_project_storage_settings(app_handle: &tauri::AppHandle) -> Result<ProjectStorageSettings, String> {
    let default_path = get_default_projects_root_path(app_handle)?;
    let payload = read_project_storage_settings_payload(app_handle)?;
    let override_path = normalize_saved_project_storage_root_path(payload.root_path)?;
    let (projects_root, is_default) = resolve_project_storage_root_path(default_path.clone(), override_path);

    fs::create_dir_all(&projects_root)
        .map_err(|e| format!("Failed to create projects directory: {}", e))?;

    let root_path = projects_root
        .canonicalize()
        .unwrap_or(projects_root)
        .to_string_lossy()
        .to_string();

    Ok(ProjectStorageSettings {
        root_path,
        default_path: default_path.to_string_lossy().to_string(),
        is_default,
    })
}

fn get_projects_root_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    build_project_storage_settings(app_handle).map(|settings| PathBuf::from(settings.root_path))
}

fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn build_local_agent_interface_command(agent: &str, project_root: &str) -> Result<(&'static str, String), String> {
    let project_root_arg = escape_powershell_single_quoted(project_root);
    match agent {
        "claude" => Ok(("Claude", "claude".to_string())),
        "codex" => Ok(("Codex", format!("codex --cd '{}'", project_root_arg))),
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
        },
        Err(error) => LocalAgentResult {
            success: false,
            content: String::new(),
            error: Some(format!("Failed to open {} CLI: {}", agent_label, error)),
            exit_code: None,
        },
    }
}

// View tool - read file contents with line numbers
#[tauri::command]
fn tool_view(params: ViewParams) -> ToolResult {
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
            error: Some(format!("Path is a directory, not a file: {}", params.file_path)),
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
        result.push_str(&format!("\n(File has {} more lines. Use 'offset' to read more.)\n", total_lines - end));
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
            error: Some(format!("Error writing file: {}", e)),
        },
    }
}

#[tauri::command]
fn tool_remove(params: RemoveParams) -> ToolResult {
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

// Edit tool - replace old_string with new_string in file
#[tauri::command]
fn tool_edit(params: EditParams) -> ToolResult {
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
                    matches.push(path.to_string_lossy().to_string());
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
            content: format!("No files matching pattern '{}' found in {}", params.pattern, path),
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

    fn search_in_dir(dir: &Path, pattern: &str, include: Option<&str>, matches: &mut Vec<String>, depth: usize) {
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
                                    matches.push(format!("{}:{}:{}", path.display(), line_num + 1, line));
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
#[tauri::command]
fn tool_bash(params: BashParams) -> ToolResult {
    let command = &params.command;

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

    let output = Command::new("sh")
        .arg("-c")
        .arg(command)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();

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
fn get_project_storage_settings(app_handle: tauri::AppHandle) -> Result<ProjectStorageSettings, String> {
    build_project_storage_settings(&app_handle)
}

#[tauri::command]
fn set_project_storage_root(app_handle: tauri::AppHandle, root_path: Option<String>) -> Result<ProjectStorageSettings, String> {
    let default_path = get_default_projects_root_path(&app_handle)?;
    let normalized_root = normalize_project_storage_root_path(root_path)?;
    let stored_root = normalized_root
        .filter(|path| path != &default_path)
        .map(|path| path.to_string_lossy().to_string());

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
fn get_requirements_dir(app_handle: tauri::AppHandle, project_id: String) -> Result<String, String> {
    let dir_path: PathBuf = get_projects_root_path(&app_handle)?
        .join(project_id)
        .join("requirements");

    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Failed to create requirements directory: {}", e))?;

    dir_path
        .canonicalize()
        .map(|path| path.to_string_lossy().to_string())
        .or_else(|_| Ok(dir_path.to_string_lossy().to_string()))
}

#[tauri::command]
fn get_project_dir(app_handle: tauri::AppHandle, project_id: String) -> Result<String, String> {
    let dir_path: PathBuf = get_projects_root_path(&app_handle)?.join(project_id);

    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    dir_path
        .canonicalize()
        .map(|path| path.to_string_lossy().to_string())
        .or_else(|_| Ok(dir_path.to_string_lossy().to_string()))
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
        .map(|path| path.to_string_lossy().to_string())
        .or_else(|_| Ok(file_path.to_string_lossy().to_string()))
}

#[tauri::command]
fn read_text_file(file_path: String) -> Result<String, String> {
    read_file_as_string(Path::new(&file_path))
        .map_err(|e| format!("Error reading file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            tool_view,
            tool_write,
            tool_remove,
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
            read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_project_storage_root_path, normalize_saved_project_storage_root_path,
        resolve_project_storage_root_path,
    };
    use std::path::PathBuf;

    #[test]
    fn project_storage_root_normalizer_treats_blank_as_default() {
        assert_eq!(normalize_project_storage_root_path(Some("   ".into())).unwrap(), None);
        assert_eq!(normalize_project_storage_root_path(None).unwrap(), None);
    }

    #[test]
    fn project_storage_root_normalizer_rejects_relative_paths() {
        let error = normalize_project_storage_root_path(Some("projects/custom".into())).unwrap_err();
        assert!(error.contains("absolute path"));
    }

    #[test]
    fn project_storage_root_resolver_uses_override_only_when_it_differs_from_default() {
        let default_path = PathBuf::from("C:/Users/test/Documents/DevFlow/projects");
        let override_path = PathBuf::from("D:/DevFlow/projects");

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

    #[cfg(target_os = "windows")]
    #[test]
    fn saved_project_storage_root_ignores_posix_path_on_windows() {
        assert_eq!(
            normalize_saved_project_storage_root_path(Some("/Users/test/DevFlow/projects".into())).unwrap(),
            None
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn saved_project_storage_root_ignores_windows_path_on_posix() {
        assert_eq!(
            normalize_saved_project_storage_root_path(Some("C:/Users/test/Documents/DevFlow/projects".into()))
                .unwrap(),
            None
        );
    }
}
