use serde::Serialize;
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

fn resolve_runtime_script_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .parent()
        .ok_or_else(|| "Failed to resolve repository root for runtime sidecar".to_string())?;
    Ok(repo_root
        .join("apps")
        .join("runtime")
        .join("dist")
        .join("apps")
        .join("runtime")
        .join("src")
        .join("index.js"))
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
    let script_path = resolve_runtime_script_path()?;
    if !script_path.exists() {
        return Err(format!(
            "Runtime sidecar build artifact not found at {}. Run `npm run runtime:build` first.",
            script_path.display()
        ));
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;
    let runtime_data_dir = app_data_dir.join("runtime-sidecar");
    std::fs::create_dir_all(&runtime_data_dir)
        .map_err(|error| format!("Failed to create runtime data directory: {}", error))?;

    let node_binary =
        std::env::var("GOODNIGHT_RUNTIME_NODE_PATH").unwrap_or_else(|_| "node".to_string());
    let child = Command::new(node_binary)
        .arg(script_path)
        .env("GOODNIGHT_RUNTIME_HOST", "127.0.0.1")
        .env("GOODNIGHT_RUNTIME_PORT", port.to_string())
        .env("GOODNIGHT_RUNTIME_TOKEN", auth_token)
        .env("GOODNIGHT_RUNTIME_DATA_DIR", runtime_data_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to launch runtime sidecar: {}", error))?;

    *guard = Some(RuntimeSidecarProcess {
        child,
        descriptor: descriptor.clone(),
    });

    wait_for_runtime_ready(&descriptor)?;
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
