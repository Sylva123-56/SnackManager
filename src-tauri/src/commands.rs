//! Tauri 命令层：薄封装，把 IO 错误转成前端可读的中文消息。

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::storage::{self, ReadOutcome};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    /// "found" | "missing"
    pub status: String,
    pub content: String,
}

impl LoadResult {
    fn from_outcome(outcome: ReadOutcome) -> Self {
        match outcome {
            ReadOutcome::Missing => Self {
                status: "missing".into(),
                content: String::new(),
            },
            ReadOutcome::Found(content) => Self {
                status: "found".into(),
                content,
            },
        }
    }
}

/// 数据目录：%APPDATA%\<identifier>
fn data_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|err| format!("无法定位数据目录：{err}"))
}

fn io_err(context: &str, err: std::io::Error) -> String {
    format!("{context}：{err}")
}

#[tauri::command]
pub fn read_data(app: AppHandle) -> Result<LoadResult, String> {
    let root = data_root(&app)?;
    storage::read_data(&root)
        .map(LoadResult::from_outcome)
        .map_err(|err| io_err("读取数据失败", err))
}

#[tauri::command]
pub fn read_backup(app: AppHandle) -> Result<LoadResult, String> {
    let root = data_root(&app)?;
    storage::read_backup(&root)
        .map(LoadResult::from_outcome)
        .map_err(|err| io_err("读取备份失败", err))
}

#[tauri::command]
pub fn write_data(app: AppHandle, content: String) -> Result<(), String> {
    let root = data_root(&app)?;
    storage::write_data(&root, &content).map_err(|err| io_err("保存失败", err))
}

#[tauri::command]
pub fn restore_from_backup(app: AppHandle) -> Result<LoadResult, String> {
    let root = data_root(&app)?;
    storage::restore_from_backup(&root)
        .map(LoadResult::from_outcome)
        .map_err(|err| io_err("恢复备份失败", err))
}

#[tauri::command]
pub fn write_side_backup(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let root = data_root(&app)?;
    storage::write_side_backup(&root, &name, &content)
        .map(|path| path.display().to_string())
        .map_err(|err| io_err("写入备份失败", err))
}

/// 返回保存后的文件名
#[tauri::command]
pub fn copy_image(app: AppHandle, source: String, file_name: String) -> Result<String, String> {
    let root = data_root(&app)?;
    storage::copy_image(&root, &PathBuf::from(source), &file_name)
        .map_err(|err| io_err("导入图片失败", err))
}

#[tauri::command]
pub fn write_image_bytes(app: AppHandle, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let root = data_root(&app)?;
    storage::write_image_bytes(&root, &file_name, &bytes)
        .map_err(|err| io_err("保存图片失败", err))
}

#[tauri::command]
pub fn remove_image(app: AppHandle, file_name: String) -> Result<(), String> {
    let root = data_root(&app)?;
    storage::remove_image(&root, &file_name).map_err(|err| io_err("删除图片失败", err))
}

/// 返回 data URL 的 base64 部分（不含前缀），前端自行拼 mime
#[tauri::command]
pub fn read_image_base64(app: AppHandle, file_name: String) -> Result<Option<String>, String> {
    let root = data_root(&app)?;
    storage::read_image_base64(&root, &file_name).map_err(|err| io_err("读取图片失败", err))
}

/// 把任意文本写到用户选择的路径（导出）
#[tauri::command]
pub fn export_text(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|err| io_err("导出失败", err))
}

/// 读取用户选择的文本文件（导入）
#[tauri::command]
pub fn import_text(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|err| io_err("无法读取文件", err))?;
    if meta.len() > 64 * 1024 * 1024 {
        return Err("文件过大（超过 64MB）".into());
    }
    std::fs::read_to_string(&path).map_err(|err| io_err("读取文件失败", err))
}

/// 打开数据目录，方便用户自行备份
#[tauri::command]
pub fn reveal_data_dir(app: AppHandle) -> Result<String, String> {
    let root = data_root(&app)?;
    storage::ensure_dirs(&root).map_err(|err| io_err("无法创建数据目录", err))?;
    Ok(root.display().to_string())
}
