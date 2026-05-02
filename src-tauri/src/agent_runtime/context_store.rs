use std::fs;
use std::path::{Path, PathBuf};

const AGENT_RUNTIME_DIR_NAME: &str = "agent-runtime";

pub fn ensure_agent_runtime_dir(app_data_dir: &Path) -> Result<PathBuf, String> {
    let runtime_dir = app_data_dir.join(AGENT_RUNTIME_DIR_NAME);
    fs::create_dir_all(&runtime_dir)
        .map_err(|error| format!("Failed to create agent runtime directory: {}", error))?;
    Ok(runtime_dir)
}
