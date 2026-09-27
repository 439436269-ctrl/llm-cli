#!/usr/bin/env node
/**
 * glm-cli —— 智谱 GLM 单供应商终端客户端（薄入口）。
 * 实现复用 lib/ 原子模块，供应商定义在 providers/glm/index.js；配置目录 ~/.glm-cli（与 1.x 兼容）。
 *
 * 快速开始:
 *   node glm_cli.js config set api-key      # 手动输入并保存 API Key
 *   node glm_cli.js ask "一句话介绍你自己"
 *   node glm_cli.js chat
 *   node glm_cli.js models
 *
 * Key 获取: https://open.bigmodel.cn 控制台 -> API Key（海外站 https://z.ai）
 */
"use strict";

const { run } = require("./lib/run");
const { ALL } = require("./providers");

const VERSION = "1.2.0";

run({
  name: "glm-cli",
  file: "glm_cli.js",
  version: VERSION,
  tagline: "终端里直接使用智谱 GLM 系列模型（零依赖，Node.js >= 18）",
  registry: { glm: ALL.glm },
  configEnv: "GLM_CLI_HOME",
  configDirName: ".glm-cli",
  fixedProvider: "glm",
  features: { provider: false, thinking: true, list: false },
  examples: [
    "node glm_cli.js config set api-key                        # 保存 API Key（隐藏输入）",
    'node glm_cli.js ask "用一句话解释量子纠缠"',
    'node glm_cli.js ask "总结这份文档" -f report.txt',
    'node glm_cli.js ask "写一首关于秋天的诗" -o poem.txt',
    "node glm_cli.js chat --thinking on",
    "node glm_cli.js chat --resume chat-latest.json",
    "node glm_cli.js models",
  ],
});
