/**
 * macOS dylib 可移植化脚本（一次性运行）。
 *
 * llama.cpp 的 macOS 二进制（llama-server + lib*.dylib）从 Homebrew 复制而来，
 * 其 install_name 和依赖路径硬编码了 /opt/homebrew/opt/{pkg}/lib/... 绝对路径，
 * 换一台没装相同 Homebrew 包的 Mac 就无法加载。本脚本用 install_name_tool 把
 * 这些路径全部改写成 @rpath/<basename>，使动态库只要和 llama-server 放在同一目录
 * 就能被正确加载（llama-server 已有 @loader_path 的 rpath）。
 *
 * 同时补全缺失的 openssl 库（libssl.3.dylib / libcrypto.3.dylib）。
 *
 * 使用：npm run fix:macos-dylibs
 * 前提：Xcode Command Line Tools 提供 install_name_tool。
 * 时机：把 llama.cpp release 包复制到 src-tauri/binaries/ 之后运行一次。
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, copyFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARIES_DIR = join(__dirname, "..", "src-tauri", "binaries");
const LLAMA_SERVER = join(BINARIES_DIR, "llama-server-aarch64-apple-darwin");

/** 匹配需要修正的绝对路径动态库依赖。
 * 匹配 /opt/homebrew/...、/Users/.../build/... 等构建期硬编码路径，
 * 但排除系统库（/usr/lib/、/System/、/lib/）——这些必须保持绝对路径指向系统目录。
 * 覆盖 Homebrew 版和官方 release 包的构建机路径两种情况。 */
const ABSOLUTE_LIB_RE = /(?:^|\s)(\/(?:opt|Users|home|tmp|var|private)\/[^\s]+\.(?:dylib|so))(?=\s|$)/g;

function log(msg) {
  console.log(`[fix-macos-dylibs] ${msg}`);
}

function warn(msg) {
  console.warn(`[fix-macos-dylibs] 警告: ${msg}`);
}

/** 运行命令，返回 stdout 字符串。 */
function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return result.stdout;
}

/** otool -L <file>：列出依赖，返回每行文本。 */
function otoolL(file) {
  return run("otool", ["-L", file]).split("\n");
}

/** otool -D <file>：返回 install_name。
 * 输出格式为两行：第一行是文件路径，第二行才是 install_name。
 */
function otoolD(file) {
  const out = run("otool", ["-D", file]).trim().split("\n");
  // 取最后一行（install_name）；单行输出时取该行
  return (out[out.length - 1] || "").trim();
}

/** install_name_tool 包装，批量执行多个操作。 */
function installNameTool(file, ops) {
  if (ops.length === 0) return;
  const args = [];
  for (const op of ops) {
    if (op.type === "id") args.push("-id", op.new);
    else if (op.type === "change") args.push("-change", op.old, op.new);
    else if (op.type === "addrpath") args.push("-add_rpath", op.path);
  }
  const result = spawnSync("install_name_tool", [...args, file], {
    encoding: "utf8",
    stdio: "pipe",
  });
  // install_name_tool 对已存在的 rpath 会报 "would duplicate path, exiting"
  // 这种情况视为成功（说明已经有该 rpath）
  if (result.status !== 0 && !result.stderr.includes("would duplicate path")) {
    console.error(result.stderr);
  }
}

/** 从 otool -L 输出提取所有绝对路径依赖，返回去重的 {old, new} 列表。
 *  覆盖 /opt/homebrew/... 和官方包的构建机绝对路径。 */
function extractAbsoluteDeps(lines) {
  const deps = new Map();
  for (const line of lines) {
    // 跳过第一行（文件本身的 install_name，由 otoolD 单独处理）
    const matches = [...line.matchAll(ABSOLUTE_LIB_RE)];
    for (const m of matches) {
      const oldPath = m[1];
      const libName = basename(oldPath);
      deps.set(oldPath, `@rpath/${libName}`);
    }
  }
  return [...deps.entries()].map(([old, neu]) => ({ old, new: neu }));
}

/** 检查可执行文件/dylib 是否已有 @loader_path 的 rpath。
 *  官方 release 包的常见问题：rpath 指向构建机目录，缺 @loader_path，
 *  导致换目录后 dylib 加载失败。若有缺失则补上。 */
function ensureLoaderPathRpath(file) {
  const out = run("otool", ["-l", file]);
  // LC_RPATH 后面跟 cmdsize + path，路径在 "path " 行后
  const hasLoaderPath = out.includes("@loader_path");
  if (!hasLoaderPath) {
    installNameTool(file, [{ type: "addrpath", path: "@loader_path" }]);
    return true;
  }
  return false;
}

/** 补全 openssl 库：若 binaries 缺失，从 Homebrew 复制。 */
function ensureOpenSSL() {
  const needed = [
    { name: "libssl.3.dylib", brew: "/opt/homebrew/opt/openssl@3/lib/libssl.3.dylib" },
    { name: "libcrypto.3.dylib", brew: "/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib" },
  ];
  const copied = [];
  for (const lib of needed) {
    const dest = join(BINARIES_DIR, lib.name);
    if (existsSync(dest)) {
      log(`openssl 已存在: ${lib.name}`);
    } else if (existsSync(lib.brew)) {
      copyFileSync(lib.brew, dest);
      // Homebrew 的 openssl 库默认权限是 444（只读无执行位）。其他 dylib 都是
      // 755。Tauri build 处理 resources 时对权限敏感（os error 13），
      // 统一设为 755 保持一致。
      spawnSync("chmod", ["755", dest], { stdio: "inherit" });
      log(`从 Homebrew 复制: ${lib.name}`);
      copied.push(dest);
    } else {
      warn(`Homebrew 未安装 ${lib.brew}，无法补全 ${lib.name}`);
    }
  }
  return copied;
}

/** 处理单个文件：修正 install_name（-id）、依赖路径（-change）、补充 rpath，然后重新 ad-hoc 签名。
 * install_name_tool 会令原代码签名失效，必须用 codesign --force --sign - 重签，
 * 否则 macOS Gatekeeper / hardened runtime 会拒绝加载。 */
function fixFile(file, isExecutable = false) {
  const ops = [];

  // 1. install_name 修正（仅 dylib；exe 的 -id 无意义）
  if (!isExecutable) {
    const id = otoolD(file);
    // 任何绝对路径的 install_name 都改写成 @rpath/<basename>
    if (id.startsWith("/")) {
      ops.push({ type: "id", new: `@rpath/${basename(id)}` });
    }
  }

  // 2. 依赖路径修正（绝对路径 → @rpath/<basename>）
  const lines = otoolL(file);
  const changes = extractAbsoluteDeps(lines);
  for (const c of changes) {
    ops.push({ type: "change", old: c.old, new: c.new });
  }

  // 3. 补充 @loader_path rpath（官方包常见缺失）
  let addedRpath = false;
  if (isExecutable) {
    addedRpath = ensureLoaderPathRpath(file);
  }

  if (ops.length === 0 && !addedRpath) return false;

  log(`修正 ${basename(file)}: ${ops.length} 处路径${addedRpath ? " + 补充 @loader_path" : ""}`);
  if (ops.length > 0) installNameTool(file, ops);

  // 4. ad-hoc 重新签名（install_name_tool 改动会令原签名失效）
  const sign = spawnSync("codesign", ["--force", "--sign", "-", file], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (sign.status !== 0) {
    warn(`ad-hoc 签名失败 ${basename(file)}: ${sign.stderr}`);
  }
  return true;
}

function main() {
  if (process.platform !== "darwin") {
    warn("此脚本仅用于 macOS，当前平台跳过。");
    return;
  }
  if (!existsSync(BINARIES_DIR)) {
    warn(`binaries 目录不存在: ${BINARIES_DIR}`);
    return;
  }

  log("开始修正 macOS dylib 路径...");

  // 1. 补全 openssl
  ensureOpenSSL();

  // 2. 收集所有需要处理的文件：所有 .dylib + llama-server exe
  const dylibs = readdirSync(BINARIES_DIR)
    .filter((f) => f.endsWith(".dylib"))
    .map((f) => join(BINARIES_DIR, f));

  let fixed = 0;
  let skipped = 0;

  for (const dylib of dylibs) {
    if (fixFile(dylib, false)) fixed++;
    else skipped++;
  }

  // 3. llama-server 可执行文件（只修 -change，不改 -id）
  if (existsSync(LLAMA_SERVER)) {
    if (fixFile(LLAMA_SERVER, true)) fixed++;
    else skipped++;
  } else {
    warn(`llama-server 不存在: ${LLAMA_SERVER}`);
  }

  log(`完成。修正 ${fixed} 个文件，跳过 ${skipped} 个（已是 @rpath 或无 homebrew 依赖）。`);
  log("提示：修正后的 dylib 可移植，复制到任意 Mac 的同目录即可加载。");
}

main();
