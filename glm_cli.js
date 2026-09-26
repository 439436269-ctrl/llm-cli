#!/usr/bin/env node
/**
 * glm-cli —— 在终端里直接使用智谱 GLM 系列模型。
 * 零依赖，需要 Node.js >= 18（内置 fetch）。
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

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { Writable } = require("node:stream");

const VERSION = "1.0.0";

// 默认智谱国内站；使用海外 z.ai 时换成 https://api.z.ai/api/paas/v4
const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "glm-5.3-flash";
const ENV_API_KEYS = ["GLM_API_KEY", "ZHIPUAI_API_KEY", "ZHIPU_API_KEY"];

// 环境变量 GLM_CLI_HOME 可把配置目录改到别处（便携 / 多账号场景）
const CONFIG_DIR = process.env.GLM_CLI_HOME || path.join(os.homedir(), ".glm-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const HISTORY_FILE = path.join(CONFIG_DIR, "chat-latest.json");

const STREAM_IDLE_MS = 120000; // 流式模式下两次数据块之间的最大等待（毫秒）
const PLAIN_MS = 300000;       // 非流式模式的整体等待（毫秒）

const HINTS = {
  401: "API Key 缺失、无效或未生效。请执行: node glm_cli.js config set api-key",
  403: "当前 Key 无权访问该模型，或账号未开通对应服务。",
  404: "模型名或接口地址可能有误：用 --model 指定模型，--base-url 指定接口地址。",
  429: "请求过于频繁，或额度/资源包不足，请稍后再试。",
};

const TIMEOUT_REASON = "glm-cli-idle-timeout";

class ApiError extends Error {}

const colors = { dim: "", bold: "", red: "", green: "", cyan: "", reset: "" };

function enableColors(noColor) {
  if (noColor || process.env.NO_COLOR || !process.stdout.isTTY) return;
  colors.dim = "\x1b[2m";
  colors.bold = "\x1b[1m";
  colors.red = "\x1b[31m";
  colors.green = "\x1b[32m";
  colors.cyan = "\x1b[36m";
  colors.reset = "\x1b[0m";
}

const state = { currentAbort: null };

// ---------------------------------------------------------------- 配置读写

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    console.error(`警告：配置文件 ${CONFIG_FILE} 读取失败（${e.message}），将忽略已有配置。`);
    return {};
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  if (process.platform !== "win32") {
    try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {}
  }
}

function resolveRuntime(args, cfg) {
  let apiKey = args.api_key;
  if (!apiKey) {
    for (const k of ENV_API_KEYS) {
      const v = process.env[k];
      if (v) { apiKey = v; break; }
    }
  }
  if (!apiKey) apiKey = cfg.api_key;
  return {
    apiKey,
    model: args.model || cfg.model || DEFAULT_MODEL,
    baseUrl: args.base_url || cfg.base_url || DEFAULT_BASE_URL,
  };
}

function requireKey(apiKey) {
  if (apiKey) return apiKey;
  throw new ApiError(
    "尚未配置 API Key，请任选其一：\n" +
    "  1. node glm_cli.js config set api-key   （推荐，保存后长期使用）\n" +
    "  2. 设置环境变量 GLM_API_KEY\n" +
    "  3. 临时使用：--api-key <你的Key>\n" +
    "Key 获取：https://open.bigmodel.cn 控制台 -> API Key"
  );
}

function mask(key) {
  if (!key) return "(未设置)";
  if (key.length <= 8) return key.slice(0, 2) + "****";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

// ---------------------------------------------------------------- HTTP / SSE

function isAbort(err) {
  return err && (err.name === "AbortError" || err.code === "ABORT_ERR");
}

async function friendlyHTTPError(resp) {
  let detail = "";
  try {
    const text = await resp.text();
    try {
      const obj = JSON.parse(text);
      detail = (obj.error && obj.error.message) || text.trim();
    } catch {
      detail = text.trim();
    }
  } catch {}
  let msg = `请求失败 [HTTP ${resp.status}]`;
  if (detail) msg += `：${detail}`;
  if (HINTS[resp.status]) msg += `\n提示：${HINTS[resp.status]}`;
  return msg;
}

async function apiFetch(url, apiKey, payload, method, signal) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  let body;
  if (payload !== null && payload !== undefined) {
    body = JSON.stringify(payload);
    if (payload.stream) headers.Accept = "text/event-stream";
  }
  let resp;
  try {
    resp = await fetch(url, { method, headers, body, signal });
  } catch (err) {
    if (isAbort(err)) throw err;
    const cause = err.cause ? (err.cause.message || String(err.cause)) : err.message;
    throw new ApiError(`无法连接服务器：${cause}（请检查网络或 --base-url）`);
  }
  if (!resp.ok) throw new ApiError(await friendlyHTTPError(resp));
  return resp;
}

async function* iterSSE(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      if (data) yield data;
    }
  }
}

function buildPayload(rt, messages, args) {
  const payload = { model: rt.model, messages, stream: !args.no_stream };
  if (args.temperature != null) payload.temperature = Number(args.temperature);
  if (args.max_tokens) payload.max_tokens = Number(args.max_tokens);
  if (args.thinking != null) {
    payload.thinking = { type: args.thinking === "on" ? "enabled" : "disabled" };
  }
  if (args.debug) {
    console.error(`[debug] ${rt.baseUrl.replace(/\/+$/, "")}/chat/completions`);
    console.error(`[debug] ${JSON.stringify(payload)}`);
  }
  return payload;
}

// ---------------------------------------------------------------- 对话调用

async function chatCompletion(rt, payload) {
  const url = rt.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const stream = !!payload.stream;
  const controller = new AbortController();
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(TIMEOUT_REASON), stream ? STREAM_IDLE_MS : PLAIN_MS);
  };
  arm();
  state.currentAbort = controller;
  const contentParts = [];
  const reasoningParts = [];
  let usage = null;
  try {
    const resp = await apiFetch(url, rt.apiKey, payload, "POST", controller.signal);
    if (stream) {
      let inThinking = false;
      for await (const data of iterSSE(resp.body)) {
        arm();
        let obj;
        try { obj = JSON.parse(data); } catch { continue; }
        if (obj.error) throw new ApiError("服务端返回错误：" + JSON.stringify(obj.error));
        if (obj.usage) usage = obj.usage;
        const choice = (obj.choices || [])[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        const rc = delta.reasoning_content;
        if (rc) {
          if (!inThinking) {
            inThinking = true;
            console.log(`${colors.dim}—— 思考 ——${colors.reset}`);
          }
          process.stdout.write(colors.dim + rc + colors.reset);
          reasoningParts.push(rc);
        }
        const text = delta.content;
        if (text) {
          if (inThinking) {
            inThinking = false;
            console.log(`\n${colors.bold}—— 回答 ——${colors.reset}`);
          }
          process.stdout.write(text);
          contentParts.push(text);
        }
      }
      console.log();
    } else {
      const obj = await resp.json();
      if (obj.error) throw new ApiError("服务端返回错误：" + JSON.stringify(obj.error));
      const message = ((obj.choices || [])[0] || {}).message || {};
      if (message.reasoning_content) {
        console.log(`${colors.dim}—— 思考 ——\n${message.reasoning_content}${colors.reset}`);
        reasoningParts.push(message.reasoning_content);
      }
      const content = message.content || "";
      console.log(content);
      contentParts.push(content);
      usage = obj.usage || null;
    }
  } catch (err) {
    if (isAbort(err)) {
      if (controller.signal.reason === TIMEOUT_REASON) {
        console.log(`\n${colors.dim}(等待数据超时，已中断)${colors.reset}`);
      } else {
        console.log(`\n${colors.dim}(已中断本次回复)${colors.reset}`);
      }
    } else {
      throw err;
    }
  } finally {
    clearTimeout(timer);
    state.currentAbort = null;
  }
  return { content: contentParts.join(""), reasoning: reasoningParts.join(""), usage };
}

function printUsageLine(usage) {
  if (usage && usage.prompt_tokens != null && usage.completion_tokens != null) {
    console.log(`${colors.dim}[tokens] 输入 ${usage.prompt_tokens} · 输出 ${usage.completion_tokens}${colors.reset}`);
  }
}

// ---------------------------------------------------------------- 子命令

function readQuestionFromFiles(files) {
  return files.map((fp) => {
    let text;
    try {
      text = fs.readFileSync(fp, "utf8");
    } catch (e) {
      throw new ApiError(`无法读取文件 ${fp}：${e.message}`);
    }
    return `文件 \`${path.basename(fp)}\` 内容：\n\`\`\`\n${text}\n\`\`\``;
  });
}

async function cmdAsk(args, cfg) {
  const rt = resolveRuntime(args, cfg);
  requireKey(rt.apiKey);

  let question = args._.join(" ").trim();
  if (!question && !process.stdin.isTTY) {
    try { question = fs.readFileSync(0, "utf8").trim(); } catch {}
  }
  if (args.file && args.file.length) {
    question = (question ? question + "\n\n" : "") + readQuestionFromFiles(args.file).join("\n\n");
  }
  if (!question) {
    throw new ApiError('请提供问题内容，例如：node glm_cli.js ask "你好"（或用管道传入；交互式多轮请用 chat 子命令）');
  }

  const messages = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: question });

  const { content, usage } = await chatCompletion(rt, buildPayload(rt, messages, args));
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, content, "utf8");
    console.log(`${colors.dim}回答已保存到 ${args.output}${colors.reset}`);
  }
  printUsageLine(usage);
}

const SLASH_HELP = [
  "命令:",
  "  /help              显示本帮助",
  "  /new               清空当前对话，重新开始",
  "  /model <名称>       临时切换模型",
  "  /system <文本>      设置/更新 system 提示词（不带文本则清除）",
  "  /save [路径]        保存当前对话记录为 JSON",
  "  /exit              退出（或 Ctrl+C / Ctrl+D）",
].join("\n");

async function cmdChat(args, cfg) {
  const rt = resolveRuntime(args, cfg);
  requireKey(rt.apiKey);

  let messages = args.system ? [{ role: "system", content: args.system }] : [];
  if (args.resume) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(args.resume, "utf8"));
    } catch (e) {
      throw new ApiError(`无法读取对话记录 ${args.resume}：${e.message}`);
    }
    messages = data.messages || messages;
    if (data.model) rt.model = data.model;
  }

  console.log(`${colors.cyan}glm-cli ${VERSION} · 模型 ${rt.model} · ${rt.baseUrl}${colors.reset}`);
  console.log(`${colors.dim}输入消息开始对话，/help 查看命令，/exit 退出。${colors.reset}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(`${colors.green}你${colors.reset} > `);
  rl.prompt();

  // 输入流结束（EOF）会自动关闭 readline，此时再 prompt 会抛 ERR_USE_AFTER_CLOSE
  let rlClosed = false;
  rl.on("close", () => { rlClosed = true; });
  const safePrompt = () => { if (!rlClosed) rl.prompt(); };

  // Ctrl+C：正在生成时中断本次回复，空闲时退出
  rl.on("SIGINT", () => {
    if (state.currentAbort) state.currentAbort.abort();
    else rl.close();
  });

  try {
    for await (const line of rl) {
      const text = line.trim();
      if (!text) { safePrompt(); continue; }

      if (text.startsWith("/")) {
        const cmd = text.split(/\s+/)[0].toLowerCase();
        const rest = text.slice(cmd.length).trim();
        if (["/exit", "/quit", "/q"].includes(cmd)) break;
        else if (cmd === "/help") console.log(SLASH_HELP);
        else if (cmd === "/new") {
          messages = messages.filter((m) => m.role === "system");
          console.log(`${colors.dim}已清空对话。${colors.reset}`);
        } else if (cmd === "/model") {
          if (rest) { rt.model = rest; console.log(`${colors.dim}已切换模型: ${rt.model}${colors.reset}`); }
          else console.log(`当前模型: ${rt.model}`);
        } else if (cmd === "/system") {
          messages = messages.filter((m) => m.role !== "system");
          if (rest) {
            messages.unshift({ role: "system", content: rest });
            console.log(`${colors.dim}system 已设置。${colors.reset}`);
          } else {
            console.log(`${colors.dim}system 已清除。${colors.reset}`);
          }
        } else if (cmd === "/save") {
          const file = rest || HISTORY_FILE;
          fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
          fs.writeFileSync(file, JSON.stringify({ model: rt.model, messages }, null, 2) + "\n", "utf8");
          console.log(`${colors.dim}对话已保存到 ${file}${colors.reset}`);
        } else {
          console.log(`${colors.dim}未知命令 ${cmd}，输入 /help 查看帮助。${colors.reset}`);
        }
        safePrompt();
        continue;
      }

      messages.push({ role: "user", content: text });
      try {
        const { content, usage } = await chatCompletion(rt, buildPayload(rt, messages, args));
        if (content.trim()) messages.push({ role: "assistant", content });
        else messages.pop(); // 回复为空（如被中断），移除未完成回合的用户消息
        printUsageLine(usage);
      } catch (e) {
        if (e instanceof ApiError) {
          console.error(`${colors.red}${e.message}${colors.reset}`);
          messages.pop(); // 回合失败，移除未送达的用户消息
        } else {
          throw e;
        }
      }
      safePrompt();
    }
  } finally {
    rl.close();
  }
}

async function cmdModels(args, cfg) {
  const rt = resolveRuntime(args, cfg);
  requireKey(rt.apiKey);
  const url = rt.baseUrl.replace(/\/+$/, "") + "/models";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(TIMEOUT_REASON), 60000);
  try {
    const resp = await apiFetch(url, rt.apiKey, null, "GET", controller.signal);
    const obj = await resp.json();
    const items = obj.data || [];
    if (!items.length) {
      console.log("服务端未返回模型列表（该接口可能不支持 /models）。请直接用 --model 指定模型名，或查阅开放平台文档。");
      return;
    }
    for (const it of items) console.log(typeof it === "string" ? it : it.id);
  } catch (err) {
    if (isAbort(err)) throw new ApiError("请求超时（>60s）。");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const rl = readline.createInterface({ input: process.stdin, output: sink, terminal: true });
    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      rl.close();
      process.stderr.write("\n");
      resolve(String(answer || "").trim());
    };
    rl.on("close", () => finish(""));
    rl.question("", finish);
  });
}

async function cmdConfig(args, cfg) {
  const [action, item, value] = args._;
  if (action === "path") {
    console.log(CONFIG_FILE);
    return;
  }

  if (action === "get") {
    console.log(`配置文件 : ${CONFIG_FILE}`);
    console.log(`api_key  : ${mask(cfg.api_key)}`);
    console.log(`model    : ${cfg.model || `(默认 ${DEFAULT_MODEL})`}`);
    console.log(`base_url : ${cfg.base_url || `(默认 ${DEFAULT_BASE_URL})`}`);
    return;
  }

  const items = { "api-key": "api_key", model: "model", "base-url": "base_url" };

  if (action === "set") {
    if (!item || !(item in items)) throw new ApiError("支持设置: api-key / model / base-url");
    let v = value;
    if (item === "api-key" && !v) v = await promptHidden("请输入 API Key（输入不会回显）: ");
    v = (v || "").trim();
    if (!v) throw new ApiError(`缺少 ${item} 的值，例如: node glm_cli.js config set ${item} <值>`);
    cfg[items[item]] = v;
    saveConfig(cfg);
    console.log(`已保存。配置文件: ${CONFIG_FILE}`);
    return;
  }

  if (action === "del") {
    if (!item || !(item in items)) throw new ApiError("支持删除: api-key / model / base-url");
    delete cfg[items[item]];
    saveConfig(cfg);
    console.log("已删除。");
    return;
  }

  throw new ApiError("用法: config set|get|del|path");
}

// ---------------------------------------------------------------- 命令行入口

const ALIASES = {
  "-m": "model", "--model": "model",
  "--api-key": "api_key",
  "--base-url": "base_url",
  "--system": "system",
  "-t": "temperature", "--temperature": "temperature",
  "--max-tokens": "max_tokens",
  "--thinking": "thinking",
  "-f": "file", "--file": "file",
  "-o": "output", "--output": "output",
  "--resume": "resume",
};

function printHelp() {
  console.log(`glm-cli ${VERSION} —— 终端里直接使用智谱 GLM 系列模型（零依赖，Node.js >= 18）

用法: node glm_cli.js <command> [参数] [选项]

命令:
  ask      单次提问: node glm_cli.js ask "问题"
  chat     多轮交互对话
  models   列出当前账号可用的模型
  config   管理本地配置（API Key 等）

选项:
  -m, --model <名称>       模型名（默认 ${DEFAULT_MODEL}）
  --api-key <Key>          本次使用的 API Key（优先级最高）
  --base-url <地址>        接口地址（默认智谱国内站，海外 z.ai 见 README）
  --system <文本>          system 提示词
  -t, --temperature <值>   采样温度
  --max-tokens <数量>      最大输出 token 数
  --thinking <on|off>      深度思考开关（对支持的模型生效）
  --no-stream              关闭流式输出
  --no-color / --debug     关闭彩色 / 调试输出

示例:
  node glm_cli.js config set api-key                        # 保存 API Key（隐藏输入）
  node glm_cli.js ask "用一句话解释量子纠缠"
  node glm_cli.js ask "总结这份文档" -f report.txt
  type report.txt | node glm_cli.js ask "总结这份文档"
  node glm_cli.js ask "写一首关于秋天的诗" -o poem.txt
  node glm_cli.js chat --thinking on
  node glm_cli.js chat --resume chat-latest.json
  node glm_cli.js models`);
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { opts.help = true; continue; }
    if (a === "-V" || a === "--version") { console.log(`glm-cli ${VERSION}`); process.exit(0); }
    if (a === "--no-stream") { opts.no_stream = true; continue; }
    if (a === "--no-color") { opts.no_color = true; continue; }
    if (a === "--debug") { opts.debug = true; continue; }
    const key = ALIASES[a];
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

async function main() {
  if (typeof fetch === "undefined") {
    console.error("需要 Node.js 18+（内置 fetch）。当前 Node 版本过旧，请升级后使用。");
    process.exitCode = 1;
    return;
  }
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${colors.red}${e.message}${colors.reset}`);
    printHelp();
    process.exitCode = 1;
    return;
  }
  enableColors(args.no_color);
  if (args.help || args._.length === 0) {
    printHelp();
    return;
  }
  const command = args._.shift();
  const cfg = loadConfig();
  try {
    if (command === "ask") await cmdAsk(args, cfg);
    else if (command === "chat") await cmdChat(args, cfg);
    else if (command === "models") await cmdModels(args, cfg);
    else if (command === "config") await cmdConfig(args, cfg);
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

main();
