/**
 * 双端 sidecar 一键准备脚本。
 *
 * 自动判断当前平台，下载 ffmpeg + llama.cpp 的对应平台官方包，
 * 解压并复制到 src-tauri/binaries/。双端（macOS arm64 / Windows x64）都支持，
 * 不依赖任何开发机环境（无需 Homebrew、无需手动下载）。
 *
 * 使用：npm run prepare:sidecars
 *
 * 支持平台：
 *   macOS arm64 (Apple Silicon) — ffmpeg (evermeet.cx) + llama.cpp (GitHub release)
 *   Windows x64                — ffmpeg (gyan.dev) + llama.cpp (GitHub release)
 *
 * 其他平台（macOS Intel / Linux）会明确报错退出。
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  copyFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BINARIES_DIR = join(ROOT, "src-tauri", "binaries");

// ── 工具函数 ──────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[prepare-sidecars] ${msg}`);
}

function fail(msg) {
  console.error(`[prepare-sidecars] 错误: ${msg}`);
  process.exit(1);
}

/** 当前平台的目标三元组（与 Tauri externalBin 约定一致）。 */
function resolveTriple() {
  const arch = process.arch;
  if (process.platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  if (process.platform === "win32") {
    return "x86_64-pc-windows-msvc";
  }
  return null;
}

/** 当前平台可执行文件后缀。 */
function exeExt() {
  return process.platform === "win32" ? ".exe" : "";
}

/** 当前平台动态库扩展名（用于清理和复制 llama 配套库）。 */
function libExt() {
  if (process.platform === "darwin") return ".dylib";
  if (process.platform === "win32") return ".dll";
  return ".so";
}

// ── 平台配置 ──────────────────────────────────────────────────────────

/** 返回当前平台的 ffmpeg 下载配置。 */
function ffmpegConfig() {
  const ext = exeExt();
  const triple = resolveTriple();
  if (process.platform === "darwin" && process.arch === "arm64") {
    return {
      url: "https://evermeet.cx/ffmpeg/getrelease/zip?build=arm64",
      // evermeet 包是 flat 结构：ffmpeg 直接在根目录
      exeName: "ffmpeg",
      targetName: `ffmpeg-${triple}`,
      needsFix: false,
    };
  }
  if (process.platform === "win32") {
    return {
      url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
      // gyan.dev 包是 nested：ffmpeg-*/bin/ffmpeg.exe
      exeName: "ffmpeg.exe",
      targetName: `ffmpeg-${triple}${ext}`,
      needsFix: false,
    };
  }
  return null;
}

/** 查询 llama.cpp 最新 release 的当前平台资产。 */
async function fetchLlamaAsset() {
  const ext = exeExt();
  const triple = resolveTriple();
  let assetFilter;
  if (process.platform === "darwin" && process.arch === "arm64") {
    assetFilter = (a) => a.name.includes("macos-arm64") && a.name.endsWith(".tar.gz");
  } else if (process.platform === "win32") {
    assetFilter = (a) => a.name.includes("bin-win-cpu-x64") && a.name.endsWith(".zip");
  } else {
    return null;
  }

  log("查询 llama.cpp 最新 release...");
  const resp = await fetch("https://api.github.com/repos/ggml-org/llama.cpp/releases/latest", {
    headers: { "User-Agent": "echosub-prepare-sidecars" },
  });
  if (!resp.ok) fail(`GitHub API 请求失败: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  const asset = (data.assets || []).find(assetFilter);
  if (!asset) fail(`未在 release ${data.tag_name} 找到当前平台的 llama.cpp 包`);
  log(`llama.cpp 最新版本: ${data.tag_name}`);
  return {
    url: asset.browser_download_url,
    name: asset.name,
    exeName: `llama-server${ext}`,
    targetName: `llama-server-${triple}${ext}`,
    needsFix: process.platform === "darwin",
  };
}

// ── 通用下载/解压/定位 ────────────────────────────────────────────────

/** 下载文件到指定路径（跟随重定向）。 */
async function download(url, dest) {
  log(`下载: ${url}`);
  const resp = await fetch(url, {
    headers: { "User-Agent": "echosub-prepare-sidecars" },
    redirect: "follow",
  });
  if (!resp.ok) fail(`下载失败: ${resp.status} ${resp.statusText} (${url})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(dest, buf);
  log(`已下载 ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${basename(dest)}`);
}

/** 解压 zip 或 tar.gz 到指定目录。统一用 tar -xf（bsdtar 在双端都支持两种格式）。 */
function extract(archivePath, destDir) {
  log(`解压: ${basename(archivePath)} → ${destDir}`);
  const result = spawnSync("tar", ["-xf", archivePath, "-C", destDir], {
    stdio: "pipe",
  });
  if (result.status !== 0) {
    fail(`解压失败 (exit ${result.status}): ${result.stderr?.toString().trim()}`);
  }
}

/** 在解压目录里递归查找指定可执行文件（兼容 flat 和 nested 结构）。
 *  返回找到的文件绝对路径，找不到返回 null。 */
function findExecutable(dir, exeName) {
  // 先在根目录找
  const rootCandidate = join(dir, exeName);
  if (existsSync(rootCandidate)) return rootCandidate;

  // 递归搜索（最多 3 层，应对 ffmpeg Windows 的 bin/ffmpeg.exe）
  function search(d, depth) {
    if (depth > 3) return null;
    try {
      const entries = readdirSync(d);
      for (const entry of entries) {
        const full = join(d, entry);
        if (entry === exeName && existsSync(full)) return full;
        if (statSync(full).isDirectory()) {
          const found = search(full, depth + 1);
          if (found) return found;
        }
      }
    } catch {
      // 权限等错误忽略
    }
    return null;
  }
  return search(dir, 0);
}

// ── 清理旧文件 ────────────────────────────────────────────────────────

/** 清理 binaries 目录里 ffmpeg 和 llama 的旧文件（避免版本残留）。
 *  只清理 ffmpeg-、llama-server- 前缀，以及 llama 配套库（libllama、libggml、
 *  libmtmd、libssl、libcrypto 前缀的 .dylib/.dll）。
 *  保留 .gitkeep 和其他无关文件。 */
function cleanOldFiles() {
  if (!existsSync(BINARIES_DIR)) {
    mkdirSync(BINARIES_DIR, { recursive: true });
    return;
  }
  const libPrefixes = ["libllama", "libggml", "libmtmd", "libssl", "libcrypto"];
  let cleaned = 0;
  for (const f of readdirSync(BINARIES_DIR)) {
    const isFfmpeg = f.startsWith("ffmpeg-");
    const isLlamaServer = f.startsWith("llama-server-");
    // Windows 的 llama DLL 命名（ggml-base.dll, llama.dll 等）
    const isLlamaDll =
      process.platform === "win32" &&
      f.endsWith(".dll") &&
      (libPrefixes.some((p) => f.toLowerCase().startsWith(p.toLowerCase())) ||
        f.toLowerCase().includes("ggml") ||
        f.toLowerCase().startsWith("llama.dll"));
    // macOS 的 llama dylib
    const isLlamaDylib =
      process.platform === "darwin" && libPrefixes.some((p) => f.startsWith(p));

    if (isFfmpeg || isLlamaServer || isLlamaDll || isLlamaDylib) {
      rmSync(join(BINARIES_DIR, f), { force: true });
      cleaned++;
    }
  }
  if (cleaned > 0) log(`已清理 ${cleaned} 个旧文件`);
}

// ── 各 sidecar 处理流程 ──────────────────────────────────────────────

/** 处理 ffmpeg：下载 → 解压 → 定位 → 复制。 */
async function prepareFfmpeg(workDir, config) {
  log("=== 准备 ffmpeg ===");
  const archivePath = join(workDir, `ffmpeg${archiveExt(config.url)}`);
  await download(config.url, archivePath);

  const extractDir = join(workDir, "ffmpeg-extracted");
  mkdirSync(extractDir, { recursive: true });
  extract(archivePath, extractDir);

  const exePath = findExecutable(extractDir, config.exeName);
  if (!exePath) fail(`解压后未找到 ${config.exeName}`);

  const dest = join(BINARIES_DIR, config.targetName);
  copyFileSync(exePath, dest);
  if (process.platform !== "win32") {
    spawnSync("chmod", ["755", dest], { stdio: "inherit" });
  }
  log(`ffmpeg → ${config.targetName}`);
}

/** 处理 llama：下载 → 解压 → 定位 exe → 复制 exe + 配套库 → (macOS) fix。 */
async function prepareLlama(workDir, config) {
  log("=== 准备 llama-server ===");
  const archivePath = join(workDir, config.name);
  await download(config.url, archivePath);

  const extractDir = join(workDir, "llama-extracted");
  mkdirSync(extractDir, { recursive: true });
  extract(archivePath, extractDir);

  const exePath = findExecutable(extractDir, config.exeName);
  if (!exePath) fail(`解压后未找到 ${config.exeName}`);

  const exeDir = dirname(exePath);
  const dest = join(BINARIES_DIR, config.targetName);
  copyFileSync(exePath, dest);
  if (process.platform !== "win32") {
    spawnSync("chmod", ["755", dest], { stdio: "inherit" });
  }
  log(`llama-server → ${config.targetName}`);

  // 复制配套动态库（与 exe 同目录的 .dylib / .dll）
  const libExtension = libExt();
  const libs = readdirSync(exeDir).filter((f) => f.endsWith(libExtension));
  for (const lib of libs) {
    copyFileSync(join(exeDir, lib), join(BINARIES_DIR, lib));
    if (process.platform !== "win32") {
      spawnSync("chmod", ["755", join(BINARIES_DIR, lib)], { stdio: "inherit" });
    }
  }
  log(`复制 ${libs.length} 个 ${libExtension} 动态库`);

  // macOS 调用 fix 脚本做路径检查（官方包通常是 no-op，作为兜底）
  if (config.needsFix) {
    log("调用 fix-macos-dylibs 检查动态库路径...");
    const fixScript = join(__dirname, "fix-macos-dylibs.mjs");
    const result = spawnSync("node", [fixScript], { stdio: "inherit" });
    if (result.status !== 0) fail("fix-macos-dylibs 执行失败");
  }
}

/** 从 URL 推断归档扩展名。 */
function archiveExt(url) {
  if (url.endsWith(".zip")) return ".zip";
  if (url.endsWith(".tar.gz")) return ".tar.gz";
  return ".bin";
}

// ── 主流程 ────────────────────────────────────────────────────────────

async function main() {
  // 1. 平台校验
  const triple = resolveTriple();
  if (!triple) {
    fail(
      `当前平台不支持: ${process.platform}/${process.arch}。` +
        `支持的平台: macOS arm64 (Apple Silicon)、Windows x64。`,
    );
  }
  log(`当前平台: ${process.platform}/${process.arch} (${triple})`);

  // 2. 解析配置
  const ffmpegCfg = ffmpegConfig();
  const llamaCfg = await fetchLlamaAsset();
  if (!ffmpegCfg) fail("当前平台无 ffmpeg 下载配置");
  if (!llamaCfg) fail("当前平台无 llama.cpp 下载配置");

  // 3. 准备工作目录
  const workDir = mkdtempSync(join(tmpdir(), "sidecars-"));
  log(`工作目录: ${workDir}`);

  try {
    // 4. 清理旧文件
    cleanOldFiles();

    // 5. 下载并处理两个 sidecar
    await prepareFfmpeg(workDir, ffmpegCfg);
    await prepareLlama(workDir, llamaCfg);

    // 6. 完成摘要
    log("=== 完成 ===");
    log(`sidecar 已就绪于 ${BINARIES_DIR}`);
    log(`  ffmpeg:   ${ffmpegCfg.targetName}`);
    log(`  llama:    ${llamaCfg.targetName} + 配套 ${libExt()}`);
    if (process.platform === "darwin") {
      log("现在可以运行 npm run tauri dev 或 npm run tauri build");
    } else {
      log("现在可以运行 npm run tauri dev 或 npm run tauri build");
    }
  } finally {
    // 7. 清理工作目录（即使出错也清理）
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => fail(err.message));
