use std::fs;
use std::path::{Path, PathBuf};

const AGENT_SHELL_DIR_NAME: &str = "agent-shell";

pub fn ensure_agent_shell_dir(app_data_dir: &Path) -> Result<PathBuf, String> {
    let shell_dir = app_data_dir.join(AGENT_SHELL_DIR_NAME);
    fs::create_dir_all(&shell_dir)
        .map_err(|error| format!("Failed to create agent shell directory: {}", error))?;
    Ok(shell_dir)
}
