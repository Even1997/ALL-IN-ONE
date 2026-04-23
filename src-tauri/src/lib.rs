// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            tool_view,
            tool_write,
            tool_edit,
            tool_ls,
            tool_glob,
            tool_grep,
            tool_bash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
