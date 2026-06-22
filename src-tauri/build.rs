fn main() {
    tauri_build::build();

    // 把 sidecar 可执行文件复制到 target/<profile>/binaries/，
    // 使其与依赖动态库处于同一目录。
    //
    // 背景：Tauri 运行时按 <exe_dir>/<sidecar_name> 解析 sidecar 路径，例如
    // binaries/llama-server → target/<profile>/binaries/llama-server.exe。
    // 但 tauri-build 的 externalBin 机制把 exe 复制到 target/<profile>/ 根目录
    // （去掉了 binaries/ 前缀），两者不一致，导致 sidecar 找不到 exe（os error 2）。
    // 这里手动把 exe 放到运行时实际查找的目录，dev 与 release 均生效。
    copy_sidecar_exes();

    // 把 sidecar 依赖的动态库（macOS .dylib / Windows .dll / Linux .so）
    // 复制到同目录，使 sidecar 进程能在 dev 模式按 @loader_path / 同目录加载它们。
    // 平台感知：只复制当前编译目标平台的动态库扩展名。
    copy_sidecar_dylibs();
}

/// 当前编译目标的平台三元组（与 tauri-build 用的 TARGET 一致）。
fn target_triple() -> String {
    std::env::var("TARGET").unwrap_or_else(|_| {
        // 兜底：host triple，保证极端情况下也能工作
        if cfg!(target_os = "windows") {
            "x86_64-pc-windows-msvc".to_string()
        } else if cfg!(target_os = "macos") {
            if cfg!(target_arch = "aarch64") {
                "aarch64-apple-darwin".to_string()
            } else {
                "x86_64-apple-darwin".to_string()
            }
        } else {
            "x86_64-unknown-linux-gnu".to_string()
        }
    })
}

fn copy_sidecar_exes() {
    let binaries_dir = std::path::Path::new("binaries");

    // OUT_DIR 形如 target/<profile>/build/<crate-hash>/out，回溯三级到 target/<profile>。
    let out_dir = match std::env::var_os("OUT_DIR") {
        Some(d) => std::path::PathBuf::from(d),
        None => return,
    };
    let target_dir = out_dir
        .ancestors()
        .nth(3)
        .expect("OUT_DIR 应至少有三级父目录");

    // 运行时查找目录：<target_dir>/binaries（与 resources 放 DLL 的位置一致）。
    let dest_dir = target_dir.join("binaries");
    let _ = std::fs::create_dir_all(&dest_dir);

    let triple = target_triple();
    let Ok(entries) = std::fs::read_dir(binaries_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        // 只处理带平台三元组后缀的 sidecar 可执行文件
        // （如 llama-server-x86_64-pc-windows-msvc.exe、ffmpeg-x86_64-pc-windows-msvc.exe）
        let Some(fname) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !fname.contains(&format!("-{triple}")) {
            continue;
        }

        println!("cargo:rerun-if-changed={}", path.display());

        // 复制到 <target_dir>/binaries/，去掉平台三元组后缀，保留扩展名。
        // 例：llama-server-x86_64-pc-windows-msvc.exe → binaries/llama-server.exe
        let dest_name = fname.replace(&format!("-{triple}"), "");
        let dest = dest_dir.join(&dest_name);
        let _ = std::fs::copy(&path, &dest);
    }
}

/// 当前平台 sidecar 依赖的动态库扩展名判定。
fn is_platform_dylib(fname: &str) -> bool {
    if cfg!(target_os = "macos") {
        fname.ends_with(".dylib")
    } else if cfg!(target_os = "windows") {
        fname.ends_with(".dll")
    } else {
        // Linux: libfoo.so / libfoo.so.1 / libfoo.so.1.2.3
        fname.contains(".so")
    }
}

/// 把 binaries/ 下当前平台的动态库复制到 <target_dir>/binaries/，
/// 使 dev 模式下 sidecar 进程能在自身目录找到依赖（@loader_path / 同目录）。
///
/// 仅复制当前平台扩展名；不存在的文件跳过。release 打包时 resources 机制
/// 另行处理（见 tauri.sidecars.conf.json overlay），但 dev 模式必须靠此步骤。
fn copy_sidecar_dylibs() {
    let binaries_dir = std::path::Path::new("binaries");

    // OUT_DIR 形如 target/<profile>/build/<crate-hash>/out，回溯三级到 target/<profile>。
    let out_dir = match std::env::var_os("OUT_DIR") {
        Some(d) => std::path::PathBuf::from(d),
        None => return,
    };
    let target_dir = out_dir
        .ancestors()
        .nth(3)
        .expect("OUT_DIR 应至少有三级父目录");

    let dest_dir = target_dir.join("binaries");
    let _ = std::fs::create_dir_all(&dest_dir);

    let Ok(entries) = std::fs::read_dir(binaries_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(fname) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !is_platform_dylib(fname) {
            continue;
        }

        println!("cargo:rerun-if-changed={}", path.display());

        let dest = dest_dir.join(fname);
        let _ = std::fs::copy(&path, &dest);
    }
}
