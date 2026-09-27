"use strict";
// 配置文件读写。单供应商入口沿用 1.x 的扁平结构，多供应商入口用嵌套结构。
const fs = require("node:fs");
const path = require("node:path");

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    console.error(`警告：配置文件 ${file} 读取失败（${e.message}），将忽略已有配置。`);
    return {};
  }
}

function saveJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
  if (process.platform !== "win32") {
    try { fs.chmodSync(file, 0o600); } catch {}
  }
}

// 把 1.x 单供应商的扁平配置 {api_key,...} 包装成统一的 {providers:{...}} 结构
function loadUnified(file, { singleProvider } = {}) {
  const raw = loadJson(file);
  if (singleProvider && !raw.providers && (raw.api_key || raw.model || raw.base_url)) {
    return { default_provider: singleProvider, providers: { [singleProvider]: raw } };
  }
  return raw;
}

// 单供应商入口写回时保持扁平结构（与 1.x 配置文件完全兼容）
function saveUnified(file, cfg, { singleProvider } = {}) {
  if (singleProvider) {
    saveJson(file, (cfg.providers && cfg.providers[singleProvider]) || {});
    return;
  }
  saveJson(file, cfg);
}

function resolveConfigPath({ configEnv, configDirName }) {
  return path.join(process.env[configEnv] || path.join(require("node:os").homedir(), configDirName), "config.json");
}

function historyPathFor(configFile) {
  return path.join(path.dirname(configFile), "chat-latest.json");
}

module.exports = { loadJson, saveJson, loadUnified, saveUnified, resolveConfigPath, historyPathFor };
