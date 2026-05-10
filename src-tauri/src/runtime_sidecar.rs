use serde::Serialize;
use std::env;
use std::ffi::OsString;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSidecarDescriptor {
    pub base_url: String,
    pub auth_token: String,
}

struct RuntimeSidecarProcess {
    child: Child,
    descriptor: RuntimeSidecarDescriptor,
}

struct RuntimeSidecarEntryPoint {
    path: PathBuf,
    node_args: Vec<OsString>,
}

#[derive(Default)]
pub struct RuntimeSidecarManager {
    process: Mutex<Option<RuntimeSidecarProcess>>,
}

fn allocate_runtime_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Failed to allocate runtime port: {}", error))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Failed to read runtime port: {}", error))?
        .port();
    drop(listener);
    Ok(port)
}

fn build_runtime_token(port: u16) -> String {
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("goodnight_runtime_{}_{}", port, epoch)
}

fn resolve_runtime_entry_point() -> Result<RuntimeSidecarEntryPoint, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .parent()
        .ok_or_else(|| "Failed to resolve repository root for runtime sidecar".to_string())?;
    let source_path = repo_root
        .join("apps")
        .join("runtime")
        .join("src")
        .join("index.ts");
    if source_path.exists() {
        return Ok(RuntimeSidecarEntryPoint {
            path: source_path,
            node_args: vec![OsString::from("--experimental-strip-types")],
        });
    }

    let build_path = repo_root
        .join("apps")
        .join("runtime")
        .join("dist")
        .join("apps")
        .join("runtime")
        .join("src")
        .join("index.js");
    if build_path.exists() {
        return Ok(RuntimeSidecarEntryPoint {
            path: build_path,
            node_args: Vec::new(),
        });
    }

    Err(format!(
        "Runtime sidecar entrypoint not found. Checked {} and {}.",
        source_path.display(),
        build_path.display()
    ))
}

fn find_node_in_path(path_env: Option<OsString>) -> Option<PathBuf> {
    let path_env = path_env?;
    let binary_name = if cfg!(windows) { "node.exe" } else { "node" };
    env::split_paths(&path_env)
        .map(|entry| entry.join(binary_name))
        .find(|candidate| candidate.is_file())
}

fn resolve_node_binary() -> PathBuf {
    if let Ok(node_path) = env::var("GOODNIGHT_RUNTIME_NODE_PATH") {
        let trimmed = node_path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    if let Some(node_path) = find_node_in_path(env::var_os("PATH")) {
        return node_path;
    }

    for candidate in [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return path;
        }
    }

    PathBuf::from("node")
}

fn wait_for_runtime_ready(descriptor: &RuntimeSidecarDescriptor) -> Result<(), String> {
    let health_url = format!("{}/health", descriptor.base_url);
    for _ in 0..20 {
        if let Ok(response) = reqwest::blocking::get(&health_url) {
            if response.status().is_success() {
                return Ok(());
            }
        }
        thread::sleep(Duration::from_millis(200));
    }

    Err(format!(
        "Runtime sidecar failed health check at {}",
        health_url
    ))
}

fn build_running_descriptor(port: u16, auth_token: String) -> RuntimeSidecarDescriptor {
    RuntimeSidecarDescriptor {
        base_url: format!("http://127.0.0.1:{}", port),
        auth_token,
    }
}

#[tauri::command]
pub fn start_runtime_sidecar(
    app: tauri::AppHandle,
    manager: tauri::State<'_, RuntimeSidecarManager>,
) -> Result<RuntimeSidecarDescriptor, String> {
    let mut guard = manager
        .process
        .lock()
        .map_err(|_| "Failed to lock runtime sidecar manager".to_string())?;

    if let Some(process) = guard.as_mut() {
        if process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            return Ok(process.descriptor.clone());
        }
    }

    let port = allocate_runtime_port()?;
    let auth_token = build_runtime_token(port);
    let descriptor = build_running_descriptor(port, auth_token.clone());
    let entry_point = resolve_runtime_entry_point()?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;
    let runtime_data_dir = app_data_dir.join("runtime-sidecar");
    std::fs::create_dir_all(&runtime_data_dir)
        .map_err(|error| format!("Failed to create runtime data directory: {}", error))?;

    let node_binary = resolve_node_binary();
    let mut command = Command::new(&node_binary);
    command.args(&entry_point.node_args);
    let child = command
        .arg(&entry_point.path)
        .env("GOODNIGHT_RUNTIME_HOST", "127.0.0.1")
        .env("GOODNIGHT_RUNTIME_PORT", port.to_string())
        .env("GOODNIGHT_RUNTIME_TOKEN", auth_token)
        .env("GOODNIGHT_RUNTIME_DATA_DIR", runtime_data_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to launch runtime sidecar with Node at {}: {}",
                node_binary.display(),
                error
            )
        })?;

    *guard = Some(RuntimeSidecarProcess {
        child,
        descriptor: descriptor.clone(),
    });

    if let Err(error) = wait_for_runtime_ready(&descriptor) {
        if let Some(mut process) = guard.take() {
            let _ = process.child.kill();
            let _ = process.child.wait();
        }
        return Err(error);
    }

    Ok(descriptor)
}

#[tauri::command]
pub fn get_runtime_sidecar_status(
    manager: tauri::State<'_, RuntimeSidecarManager>,
) -> Result<Option<RuntimeSidecarDescriptor>, String> {
    let mut guard = manager
        .process
        .lock()
        .map_err(|_| "Failed to lock runtime sidecar manager".to_string())?;

    let Some(process) = guard.as_mut() else {
        return Ok(None);
    };

    if process
        .child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        *guard = None;
        return Ok(None);
    }

    Ok(Some(process.descriptor.clone()))
}

#[tauri::command]
pub fn stop_runtime_sidecar(
    manager: tauri::State<'_, RuntimeSidecarManager>,
) -> Result<(), String> {
    let mut guard = manager
        .process
        .lock()
        .map_err(|_| "Failed to lock runtime sidecar manager".to_string())?;

    if let Some(mut process) = guard.take() {
        process
            .child
            .kill()
            .map_err(|error| format!("Failed to stop runtime sidecar: {}", error))?;
        let _ = process.child.wait();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::find_node_in_path;
    use std::env;
    use std::fs;

    #[test]
    fn find_node_in_path_uses_explicit_path_entries() {
        let temp_dir = env::temp_dir().join(format!(
            "goodnight-runtime-node-path-{}",
            std::process::id()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let node_path = temp_dir.join(if cfg!(windows) { "node.exe" } else { "node" });
        fs::write(&node_path, "").expect("write node placeholder");

        let resolved = find_node_in_path(Some(temp_dir.clone().into_os_string()));

        assert_eq!(resolved.as_deref(), Some(node_path.as_path()));
        let _ = fs::remove_file(node_path);
        let _ = fs::remove_dir(temp_dir);
    }
}
