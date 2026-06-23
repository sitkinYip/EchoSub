/**
 * macOS sidecar 一键准备脚本。
 *
 * 从 llama.cpp 官方 GitHub release 下载 macOS Apple Silicon 包，
 * 解压并复制 llama-server + 全部 dylib 到 src-tauri/binaries/，
 * 然后自动调用 fix-macos-dylibs 修正动态库路径。
 *
 * 不依赖开发机环境（无需 Homebrew、无需手动下载）。开发者只需运行：
 *   npm run prepare:macos-sidecars
 *
 * 仅 macOS 可用（脚本内部会校验）。官方 release 包静态链接，
 * 不含 openssl 依赖，因此无需额外处理 openssl。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BINARIES_DIR = join(ROOT, "src-tauri", "binaries");
const SIDECAR_NAME = "llama-server-aarch64-apple-darwin";

function log(msg) {
  console.log(`[prepare-sidecars] ${msg}`);
}

function fail(msg) {
  console.error(`[prepare-sidecars] 错误: ${msg}`);
  process.exit(1);
}

/** 查询 llama.cpp 最新 release 的 macOS arm64 下载地址。 */
async function fetchLatestMacOSAsset() {
  log("查询 llama.cpp 最新 release...");
  const url = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
  const resp = await fetch(url, {
    headers: { "User-Agent": "echosub-prepare-sidecars" },
  });
  if (!resp.ok) fail(`GitHub API 请求失败: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  const tag = data.tag_name;
  const asset = (data.assets || []).find(
    (a) => a.name.includes("macos-arm64") && a.name.endsWith(".tar.gz"),
  );
  if (!asset) fail(`未在 release ${tag} 找到 macOS arm64 包`);
  log(`最新版本: ${tag}`);
  return { tag, url: asset.browser_download_url, name: asset.name };
}

/** 下载文件到指定路径。 */
async function download(url, dest) {
  log(`下载: ${url}`);
  const resp = await fetch(url, {
    headers: { "User-Agent": "echosub-prepare-sidecars" },
  });
  if (!resp.ok) fail(`下载失败: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(dest, buf);
  log(`已下载 ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${dest}`);
}

/** 解压 tar.gz 到指定目录。 */
function extract(tarPath, destDir) {
  log(`解压: ${tarPath} → ${destDir}`);
  const result = spawnSync("tar", ["-xzf", tarPath, "-C", destDir], { stdio: "inherit" });
  if (result.status !== 0) fail("解压失败");
}

/** 复制前清理 binaries 目录里旧的 llama 相关文件。
 *  避免旧版本（如 Homebrew 版的 openssl 残留）混入新包。ffmpeg 不动。 */
function cleanOldLlamaFiles() {
  if (!existsSync(BINARIES_DIR)) return;
  const files = readdirSync(BINARIES_DIR);
  for (const f of files) {
    // llama-server 二进制、所有 llama/ggml/mtmd dylib、Homebrew 残留的 openssl
    const isLlamaRelated =
      f.startsWith("llama-server") ||
      f.startsWith("libllama") ||
      f.startsWith("libggml") ||
      f.startsWith("libmtmd") ||
      f.startsWith("libssl") ||
      f.startsWith("libcrypto");
    if (isLlamaRelated) {
      rmSync(join(BINARIES_DIR, f), { force: true });
    }
  }
  log("已清理旧的 llama 相关文件");
}

/** 复制 llama-server 和全部 dylib 到 binaries 目录。 */
function copyFiles(srcDir) {
  if (!existsSync(BINARIES_DIR)) mkdirSync(BINARIES_DIR, { recursive: true });
  cleanOldLlamaFiles();

  const files = readdirSync(srcDir);
  // llama-server 二进制
  const serverSrc = files.find((f) => f === "llama-server");
  if (!serverSrc) fail("包内未找到 llama-server 二进制");
  const serverDest = join(BINARIES_DIR, SIDECAR_NAME);
  copyFileSync(join(srcDir, serverSrc), serverDest);
  spawnSync("chmod", ["+x", serverDest], { stdio: "inherit" });
  log(`复制 llama-server → ${SIDECAR_NAME}`);

  // 全部 dylib
  const dylibs = files.filter((f) => f.endsWith(".dylib"));
  for (const dylib of dylibs) {
    copyFileSync(join(srcDir, dylib), join(BINARIES_DIR, dylib));
    spawnSync("chmod", ["755", join(BINARIES_DIR, dylib)], { stdio: "inherit" });
  }
  log(`复制 ${dylibs.length} 个 dylib`);
}

/** 调用 fix-macos-dylibs 修正动态库路径。 */
function runFixScript() {
  log("调用 fix-macos-dylibs 修正动态库路径...");
  const fixScript = join(__dirname, "fix-macos-dylibs.mjs");
  const result = spawnSync("node", [fixScript], { stdio: "inherit" });
  if (result.status !== 0) fail("fix-macos-dylibs 执行失败");
}

async function main() {
  if (process.platform !== "darwin") {
    fail("此脚本仅用于 macOS。Windows 请参考 DEVELOPMENT.md §6.3 手动准备。");
  }

  log("=== 开始准备 macOS sidecar ===");

  // 1. 查询最新版本
  const { tag, url, name } = await fetchLatestMacOSAsset();

  // 2. 下载到临时目录
  const workDir = mkdtempSync(join(tmpdir(), "llama-pkg-"));
  const tarPath = join(workDir, name);
  await download(url, tarPath);

  // 3. 解压
  const extractDir = join(workDir, "extracted");
  mkdirSync(extractDir, { recursive: true });
  extract(tarPath, extractDir);

  // 4. 确认解压后的文件位置（有些包会多一层目录）
  let srcDir = extractDir;
  const entries = readdirSync(extractDir);
  if (entries.length === 1) {
    const only = join(extractDir, entries[0]);
    if (existsSync(join(only, "llama-server")) || existsSync(join(only, "build"))) {
      srcDir = only;
    }
  }

  // 5. 复制到 binaries
  copyFiles(srcDir);

  // 6. 修正动态库路径
  runFixScript();

  // 7. 清理临时目录
  rmSync(workDir, { recursive: true, force: true });

  log("=== 完成 ===");
  log(`llama.cpp ${tag} 的 macOS sidecar 已就绪，可以 npm run tauri build`);
}

main().catch((err) => fail(err.message));
