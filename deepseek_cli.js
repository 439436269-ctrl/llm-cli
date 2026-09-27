#!/usr/bin/env node
/**
 * deepseek-cli —— DeepSeek 单供应商终端客户端（薄入口）。
 * 实现复用 lib/ 原子模块，供应商定义在 providers/deepseek/index.js；配置目录 ~/.deepseek-cli（与 1.x 兼容）。
 *
 * 快速开始:
 *   node deepseek_cli.js config set api-key   # 手动输入并保存 API Key
 *   node deepseek_cli.js ask "一句话介绍你自己"
 *   node deepseek_cli.js chat
 *   node deepseek_cli.js models
 *
 * Key 获取: https://platform.deepseek.com -> API Keys
 */
"use strict";

const { run } = require("./lib/run");
const { ALL } = require("./providers");

const VERSION = "1.2.0";

run({
  name: "deepseek-cli",
  file: "deepseek_cli.js",
  version: VERSION,
  tagline: "终端里直接使用 DeepSeek 模型（deepseek-flash / deepseek-v4-pro；零依赖，Node.js >= 18）",
  registry: { deepseek: ALL.deepseek },
  configEnv: "DEEPSEEK_CLI_HOME",
  configDirName: ".deepseek-cli",
  fixedProvider: "deepseek",
  features: { provider: false, thinking: false, list: false },
  examples: [
    "node deepseek_cli.js config set api-key                   # 保存 API Key（隐藏输入）",
    'node deepseek_cli.js ask "用一句话解释量子纠缠"',
    'node deepseek_cli.js ask "总结这份文档" -f report.txt',
    'node deepseek_cli.js ask "推理一下" -m deepseek-v4-pro',
    "node deepseek_cli.js chat --resume chat-latest.json",
    "node deepseek_cli.js models",
  ],
});
