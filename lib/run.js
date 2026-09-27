"use strict";
// 入口引导：解析参数 → 加载配置 → 分发子命令。三个入口脚本都通过 run() 启动。
const { parseArgs, printHelp } = require("./args");
const { enableColors, colors } = require("./colors");
const { ApiError } = require("./errors");
const { loadUnified, saveUnified, resolveConfigPath, historyPathFor } = require("./config");
const ask = require("./commands/ask");
const chat = require("./commands/chat");
const models = require("./commands/models");
const configCmd = require("./commands/config-cmd");

async function run(entry) {
  if (typeof fetch === "undefined") {
    console.error("需要 Node.js 18+（内置 fetch）。当前 Node 版本过旧，请升级后使用。");
    process.exitCode = 1;
    return;
  }
  if (process.platform === "win32") {
    for (const s of [process.stdout, process.stderr]) {
      try { s.reconfigure({ errors: "replace" }); } catch {}
    }
  }

  let args;
  try {
    args = parseArgs(process.argv.slice(2), entry.features);
  } catch (e) {
    console.error(`${colors.red}${e.message}${colors.reset}`);
    printHelp(entry);
    process.exitCode = 1;
    return;
  }
  enableColors(args.no_color);
  if (args.version) {
    console.log(`${entry.name} ${entry.version}`);
    return;
  }
  if (args.help || args._.length === 0) {
    printHelp(entry);
    return;
  }

  const command = args._.shift();
  const configFile = resolveConfigPath(entry);
  const cfg = loadUnified(configFile, { singleProvider: entry.fixedProvider });
  const ctx = {
    entry,
    registry: entry.registry,
    features: entry.features,
    fixedProvider: entry.fixedProvider,
    configFile,
    historyFile: historyPathFor(configFile),
    saveCfg: (c) => saveUnified(configFile, c, { singleProvider: entry.fixedProvider }),
  };

  try {
    if (command === "ask") await ask(args, cfg, ctx);
    else if (command === "chat") await chat(args, cfg, ctx);
    else if (command === "models") await models(args, cfg, ctx);
    else if (command === "config") await configCmd(args, cfg, ctx);
    else throw new ApiError(`未知命令 "${command}"，可用：ask / chat / models / config`);
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`${colors.red}${e.message}${colors.reset}`);
      process.exitCode = 1;
    } else {
      console.error(e);
      process.exitCode = 1;
    }
  }
}

module.exports = { run };
