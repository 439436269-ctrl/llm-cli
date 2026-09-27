#!/usr/bin/env node
/**
 * llm-cli —— 多供应商终端客户端（薄入口）。
 * 实现为原子化模块：命令/协议在 lib/，每家供应商的定义独立在 providers/<名称>/index.js。
 *
 * 快速开始:
 *   node llm_cli.js config set api-key -p mimo   # 按供应商保存 Key（隐藏输入）
 *   node llm_cli.js ask "一句话介绍你自己"
 *   node llm_cli.js chat -p kimi
 *   node llm_cli.js models -p deepseek
 */
"use strict";

const { run } = require("./lib/run");
const { ALL } = require("./providers");

const VERSION = "1.2.1";

run({
  name: "llm-cli",
  file: "llm_cli.js",
  version: VERSION,
  tagline: "多供应商终端客户端（零依赖，Node.js >= 18）",
  registry: ALL,
  configEnv: "LLM_CLI_HOME",
  configDirName: ".llm-cli",
  fixedProvider: null,
  features: { provider: true, thinking: true, list: true },
  examples: [
    "node llm_cli.js config set api-key -p mimo",
    "node llm_cli.js config list                     # 查看所有供应商配置状态",
    'node llm_cli.js ask "用一句话解释量子纠缠"',
    'node llm_cli.js ask -m deepseek-v4-pro "推理题" # 模型名前缀自动选 DeepSeek',
    "node llm_cli.js chat -p kimi",
    "node llm_cli.js models -p glm",
    'type report.txt | node llm_cli.js ask "总结这份文档"',
  ],
});
