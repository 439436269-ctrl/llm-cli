"use strict";
// 命令行参数解析与帮助生成（按入口的 features 开关生成对应选项）。
const { ApiError } = require("./errors");

const COMMON_ALIASES = {
  "-m": "model", "--model": "model",
  "--api-key": "api_key",
  "--base-url": "base_url",
  "--system": "system",
  "-t": "temperature", "--temperature": "temperature",
  "--max-tokens": "max_tokens",
  "-f": "file", "--file": "file",
  "-o": "output", "--output": "output",
  "--resume": "resume",
};

function parseArgs(argv, features) {
  const aliases = { ...COMMON_ALIASES };
  if (features.provider) Object.assign(aliases, { "-p": "provider", "--provider": "provider" });
  if (features.thinking) Object.assign(aliases, { "--thinking": "thinking" });

  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { opts.help = true; continue; }
    if (a === "-V" || a === "--version") { opts.version = true; continue; }
    if (a === "--no-stream") { opts.no_stream = true; continue; }
    if (a === "--no-color") { opts.no_color = true; continue; }
    if (a === "--debug") { opts.debug = true; continue; }
    const key = aliases[a];
    if (!key) {
      if (a.startsWith("-")) throw new ApiError(`未知参数: ${a}`);
      opts._.push(a);
      continue;
    }
    const val = argv[++i];
    if (val === undefined) throw new ApiError(`参数 ${a} 缺少值`);
    if (key === "file") (opts.file = opts.file || []).push(val);
    else opts[key] = val;
  }
  return opts;
}

function printHelp(entry) {
  const f = entry.features;
  const registry = entry.registry;
  let providersBlock = "";
  if (f.provider) {
    const rows = Object.entries(registry)
      .map(([id, pc]) => `  ${id.padEnd(13)} ${pc.label.padEnd(18)} ${pc.defaultModel || "(需 -m)"}`)
      .join("\n");
    providersBlock = `
供应商 (-p/--provider，默认 ${Object.keys(registry)[0]}，也可按模型名前缀自动推断):
${rows}
`;
  } else {
    const pc = registry[entry.fixedProvider];
    providersBlock = `
供应商: ${entry.fixedProvider} (${pc.label})，默认端点 ${pc.defaultBase}，默认模型 ${pc.defaultModel || "(需 -m)"}
`;
  }

  const options = [
    "  -m, --model <名称>       模型名（无默认模型的供应商必须指定）",
    f.provider ? "  -p, --provider <名称>    供应商" : null,
    "  --api-key <Key>          本次使用的 API Key（优先级最高）",
    "  --base-url <地址>        接口地址",
    "  --system <文本>          system 提示词",
    "  -t, --temperature <值>   采样温度",
    "  --max-tokens <数量>      最大输出 token 数",
    f.thinking ? "  --thinking <on|off>      深度思考开关（仅智谱 GLM 生效）" : null,
    "  --no-stream              关闭流式输出",
    "  --no-color / --debug     关闭彩色 / 调试输出",
  ].filter(Boolean).join("\n");

  console.log(`${entry.name} ${entry.version} —— ${entry.tagline}

用法: node ${entry.file} <command> [参数] [选项]

命令:
  ask      单次提问: node ${entry.file} ask "问题"
  chat     多轮交互对话${f.provider ? "（支持 /provider /model /system /save）" : "（支持 /model /system /save）"}
  models   列出当前账号可用的模型
  config   管理本地配置: set/get/del${f.list ? "/list" : ""}/path
${providersBlock}
选项:
${options}

示例:
${entry.examples.map((e) => `  ${e}`).join("\n")}`);
}

module.exports = { parseArgs, printHelp };
