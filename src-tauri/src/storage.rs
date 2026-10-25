//! 存储层：单 JSON 文件 + 原子写 + .bak 备份，图片按文件名存放于 images/。
//!
//! 设计原则：
//! - **绝不因为一次写入失败而丢掉旧数据**：先写临时文件并 fsync，再原子替换。
//! - 替换前把旧文件复制成 `.bak`，用于坏档恢复。
//! - 数据内容对后端是 opaque 的 JSON 字符串，前端负责语义校验。

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const DATA_FILE: &str = "snacks.json";
pub const BACKUP_FILE: &str = "snacks.json.bak";
const IMAGES_DIR: &str = "images";

/// 读取结果：区分「文件不存在」和「读到了内容」，前者是首次启动
#[derive(Debug, PartialEq)]
pub enum ReadOutcome {
    Missing,
    Found(String),
}

pub fn data_path(root: &Path) -> PathBuf {
    root.join(DATA_FILE)
}

pub fn backup_path(root: &Path) -> PathBuf {
    root.join(BACKUP_FILE)
}

pub fn images_dir(root: &Path) -> PathBuf {
    root.join(IMAGES_DIR)
}

/// 确保根目录与 images/ 存在
pub fn ensure_dirs(root: &Path) -> std::io::Result<()> {
    fs::create_dir_all(root)?;
    fs::create_dir_all(images_dir(root))?;
    Ok(())
}

pub fn read_data(root: &Path) -> std::io::Result<ReadOutcome> {
    read_optional(&data_path(root))
}

pub fn read_backup(root: &Path) -> std::io::Result<ReadOutcome> {
    read_optional(&backup_path(root))
}

fn read_optional(path: &Path) -> std::io::Result<ReadOutcome> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(ReadOutcome::Found(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(ReadOutcome::Missing),
        Err(err) => Err(err),
    }
}

/// 原子写入：临时文件 → fsync → 备份旧文件 → rename 覆盖。
///
/// 若目标文件存在且内容非空，先复制为 `.bak`；这一步失败不阻断主写入
/// （备份是尽力而为的保险，不能因为备份失败就写不进去）。
pub fn write_data(root: &Path, contents: &str) -> std::io::Result<()> {
    ensure_dirs(root)?;
    let target = data_path(root);
    let tmp = root.join(format!("{DATA_FILE}.tmp"));

    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
    }

    if target.exists() {
        // 备份旧内容；失败时忽略，避免因为 .bak 被占用而无法保存
        let _ = fs::copy(&target, backup_path(root));
    }

    // Windows 上 rename 到已存在的目标是允许的（ReplaceFile 语义由 std 处理）
    if let Err(err) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(err);
    }
    Ok(())
}

/// 用 .bak 的内容覆盖主文件（坏档恢复）
pub fn restore_from_backup(root: &Path) -> std::io::Result<ReadOutcome> {
    let backup = read_backup(root)?;
    if let ReadOutcome::Found(text) = &backup {
        write_data(root, text)?;
    }
    Ok(backup)
}

/// 把任意外部 JSON 留档，供导入前自动备份使用
pub fn write_side_backup(root: &Path, name: &str, contents: &str) -> std::io::Result<PathBuf> {
    ensure_dirs(root)?;
    let safe = sanitize_file_name(name)?;
    let path = root.join(safe);
    fs::write(&path, contents)?;
    Ok(path)
}

fn sanitize_file_name(name: &str) -> std::io::Result<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\']) || trimmed.contains("..") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "非法文件名",
        ));
    }
    Ok(trimmed.to_string())
}

/// 校验图片扩展名；返回小写扩展名
fn image_ext(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    ["png", "jpg", "jpeg", "webp", "gif"]
        .into_iter()
        .find(|ext| lower.ends_with(&format!(".{ext}")))
}

/// 把源图片复制进 images/，返回保存后的文件名。
/// 目标文件名由前端生成（随机 uuid + 扩展名），此处再次校验以杜绝路径穿越。
pub fn copy_image(root: &Path, source: &Path, file_name: &str) -> std::io::Result<String> {
    let safe = sanitize_file_name(file_name)?;
    let ext = image_ext(&safe).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "仅支持 png / jpg / webp / gif 图片",
        )
    })?;
    let canonical_name = if safe.to_ascii_lowercase().ends_with(ext) {
        safe
    } else {
        format!("{safe}.{ext}")
    };

    let meta = fs::metadata(source)?;
    if !meta.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "不是文件",
        ));
    }
    // 10MB 上限，防止误选巨大文件撑爆数据目录
    if meta.len() > 10 * 1024 * 1024 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "图片超过 10MB",
        ));
    }

    ensure_dirs(root)?;
    let dest = images_dir(root).join(&canonical_name);
    fs::copy(source, &dest)?;
    Ok(canonical_name)
}

pub fn write_image_bytes(root: &Path, file_name: &str, bytes: &[u8]) -> std::io::Result<String> {
    let safe = sanitize_file_name(file_name)?;
    if image_ext(&safe).is_none() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "仅支持 png / jpg / webp / gif 图片",
        ));
    }
    ensure_dirs(root)?;
    let dest = images_dir(root).join(&safe);
    fs::write(dest, bytes)?;
    Ok(safe)
}

pub fn remove_image(root: &Path, file_name: &str) -> std::io::Result<()> {
    let safe = sanitize_file_name(file_name)?;
    let path = images_dir(root).join(safe);
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err),
    }
}

pub fn read_image_base64(root: &Path, file_name: &str) -> std::io::Result<Option<String>> {
    let safe = sanitize_file_name(file_name)?;
    let path = images_dir(root).join(safe);
    match fs::read(&path) {
        Ok(bytes) => Ok(Some(base64_encode(&bytes))),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err),
    }
}

/// 极简 base64 编码，避免为了一个功能引入额外 crate
pub fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_root(tag: &str) -> PathBuf {
        let mut dir = env::temp_dir();
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        dir.push(format!("snack-test-{tag}-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_missing_returns_missing() {
        let root = temp_root("missing");
        assert_eq!(read_data(&root).unwrap(), ReadOutcome::Missing);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn write_then_read_roundtrip() {
        let root = temp_root("roundtrip");
        write_data(&root, "{\"entries\":[]}").unwrap();
        assert_eq!(
            read_data(&root).unwrap(),
            ReadOutcome::Found("{\"entries\":[]}".into())
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn write_creates_backup_of_previous_content() {
        let root = temp_root("backup");
        write_data(&root, "first").unwrap();
        write_data(&root, "second").unwrap();

        assert_eq!(read_data(&root).unwrap(), ReadOutcome::Found("second".into()));
        assert_eq!(
            read_backup(&root).unwrap(),
            ReadOutcome::Found("first".into())
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn first_write_does_not_create_backup() {
        let root = temp_root("nobackup");
        write_data(&root, "only").unwrap();
        assert_eq!(read_backup(&root).unwrap(), ReadOutcome::Missing);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn no_temp_file_left_behind() {
        let root = temp_root("tmp");
        write_data(&root, "x").unwrap();
        assert!(!root.join(format!("{DATA_FILE}.tmp")).exists());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn restore_from_backup_recovers() {
        let root = temp_root("restore");
        write_data(&root, "good").unwrap();
        write_data(&root, "newer").unwrap();
        // 模拟主文件被外部破坏
        fs::write(data_path(&root), "corrupted").unwrap();

        let restored = restore_from_backup(&root).unwrap();
        assert_eq!(restored, ReadOutcome::Found("good".into()));
        assert_eq!(read_data(&root).unwrap(), ReadOutcome::Found("good".into()));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn restore_without_backup_is_noop() {
        let root = temp_root("norestore");
        write_data(&root, "keep").unwrap();
        assert_eq!(
            restore_from_backup(&root).unwrap(),
            ReadOutcome::Missing
        );
        assert_eq!(read_data(&root).unwrap(), ReadOutcome::Found("keep".into()));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn side_backup_rejects_illegal_names() {
        let root = temp_root("sidebad");
        assert!(write_side_backup(&root, "../evil.json", "{}").is_err());
        assert!(write_side_backup(&root, "a/b.json", "{}").is_err());
        assert!(write_side_backup(&root, "  ", "{}").is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn side_backup_writes_file() {
        let root = temp_root("sideok");
        let path = write_side_backup(&root, "snacks.pre-import.json", "{}").unwrap();
        assert!(path.exists());
        assert_eq!(fs::read_to_string(path).unwrap(), "{}");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn image_copy_and_remove() {
        let root = temp_root("image");
        let src = root.join("src.png");
        fs::write(&src, b"fakepng").unwrap();

        let saved = copy_image(&root, &src, "abc123.png").unwrap();
        assert_eq!(saved, "abc123.png");
        assert!(images_dir(&root).join("abc123.png").exists());

        let encoded = read_image_base64(&root, "abc123.png").unwrap().unwrap();
        assert_eq!(encoded, base64_encode(b"fakepng"));

        remove_image(&root, "abc123.png").unwrap();
        assert_eq!(read_image_base64(&root, "abc123.png").unwrap(), None);
        // 重复删除不报错
        remove_image(&root, "abc123.png").unwrap();
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn image_copy_rejects_bad_extension_and_traversal() {
        let root = temp_root("imagereject");
        let src = root.join("src.txt");
        fs::write(&src, b"x").unwrap();
        assert!(copy_image(&root, &src, "a.txt").is_err());
        assert!(copy_image(&root, &src, "../a.png").is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }
}
