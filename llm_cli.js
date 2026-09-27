#!/usr/bin/env node
/**
 * llm-cli —— 多供应商终端客户端：智谱 GLM / DeepSeek / 小米 MiMo / Kimi / 硅基流动 / 火山方舟 / OpenAI。
 * 零依赖，需要 Node.js >= 18（内置 fetch）。
 *
 * 快速开始:
 *   node llm_cli.js config set api-key --provider mimo    # 按供应商保存 Key（隐藏输入）
 *   node llm_cli.js ask "一句话介绍你自己"
 *   node llm_cli.js chat -p kimi
 *   node llm_cli.js models -p deepseek
 *
 * 供应商与 Key 获取地址见 --help；配置文件 ~/.llm-cli/config.json。
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { Writable } = require("node:stream");

const VERSION = "1.1.0";

// defaultModel 为 null 表示该供应商没有内置默认模型，调用时必须用 -m 指定
const PROVIDERS = {
  glm: {
    label: "智谱 GLM",
    defaultBase: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5.3-flash",
    envKeys: ["GLM_API_KEY", "ZHIPUAI_API_KEY", "ZHIPU_API_KEY"],
    keyUrl: "https://open.bigmodel.cn 控制台 -> API Key",
    hint: "可用模型：glm-5.3-flash / glm-5.3 / glm-4.6 / glm-4.7 等（coding 订阅端点见 README）",
    supportsThinking: true,
    prefixes: ["glm"],
  },
  deepseek: {
    label: "DeepSeek",
    defaultBase: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-flash",
    envKeys: ["DEEPSEEK_API_KEY"],
    keyUrl: "https://platform.deepseek.com -> API Keys",
    hint: "当前账号可用：deepseek-flash / deepseek-v4-pro",
    supportsThinking: false,
    prefixes: ["deepseek"],
  },
  mimo: {
    label: "小米 MiMo",
    defaultBase: "https://api.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.6-flash",
    envKeys: ["MIMO_API_KEY", "XIAOMI_API_KEY"],
    keyUrl: "https://platform.xiaomimimo.com",
    hint: "可用模型：mimo-v2.6-flash / mimo-v2.6-pro / mimo-v2.5 等",
    supportsThinking: false,
    prefixes: ["mimo"],
  },
  kimi: {
    label: "Kimi（月之暗面）",
    defaultBase: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-latest",
    envKeys: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    keyUrl: "https://platform.moonshot.cn -> API Key",
    hint: "默认 kimi-latest（自动指向最新模型）",
    supportsThinking: false,
    prefixes: ["kimi", "moonshot"],
  },
  siliconflow: {
    label: "硅基流动 SiliconFlow",
    defaultBase: "https://api.siliconflow.cn/v1",
    defaultModel: null,
    envKeys: ["SILICONFLOW_API_KEY"],
    keyUrl: "https://cloud.siliconflow.cn -> API 密钥",
    hint: "模型名形如 deepseek-ai/DeepSeek-V3.1，需用 -m 指定",
    supportsThinking: false,
    prefixes: ["siliconflow"],
  },
  ark: {
    label: "火山方舟 Ark（豆包）",
    defaultBase: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: null,
    envKeys: ["ARK_API_KEY"],
    keyUrl: "https://console.volcengine.com/ark -> API Key",
    hint: "模型为接入点 ID 或 doubao-* 名称，需用 -m 指定",
    supportsThinking: false,
    prefixes: ["ark", "doubao"],
  },
  openai: {
    label: "OpenAI",
    defaultBase: "https://api.openai.com/v1",
    defaultModel: null,
    envKeys: ["OPENAI_API_KEY"],
    keyUrl: "https://platform.openai.com -> API keys",
    hint: "需用 -m 指定模型（如 gpt-*）",
    supportsThinking: false,
    prefixes: ["gpt"],
  },
};

// 环境变量 LLM_CLI_HOME 可把配置目录改到别处（便携 / 多账号场景）
const CONFIG_DIR = process.env.LLM_CLI_HOME || path.join(os.homedir(), ".llm-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const HISTORY_FILE = path.join(CONFIG_DIR, "chat-latest.json");

const STREAM_IDLE_MS = 120000; // 流式模式下两次数据块之间的最大等待（毫秒）
const PLAIN_MS = 300000;       // 非流式模式的整体等待（毫秒）

const HINTS = {
  401: "API Key 缺失、无效或未生效。请执行: node llm_cli.js config set api-key --provider <名称>",
  403: "当前 Key 无权访问该模型，或账户余额不足。",
  404: "模型名或接口地址可能有误：用 -m/--model 指定模型，--base-url 指定接口地址。",
  402: "账户余额不足，请前往对应平台充值。",
  429: "请求过于频繁，或额度/资源包不足，请稍后再试。",
};

const TIMEOUT_REASON = "llm-cli-idle-timeout";

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

function normalizeProvider(p) {
  const key = String(p || "").trim().toLowerCase();
  const alias = { zhipu: "glm", moonshot: "kimi", xiaomi: "mimo", volc: "ark" };
  const name = alias[key] || key;
  if (!PROVIDERS[name]) {
    throw new ApiError(`未知供应商 "${p}"，可选：${Object.keys(PROVIDERS).join(" / ")}`);
  }
  return name;
}

// 没显式指定 --provider 时，尝试从模型名前缀推断（如 glm-* / deepseek-* / mimo-*）
function inferProvider(model) {
  const m = String(model || "").toLowerCase();
  for (const [id, pc] of Object.entries(PROVIDERS)) {
    if (pc.prefixes.some((p) => m.startsWith(p))) return id;
  }
  return null;
}

function providerOf(args, cfg) {
  return normalizeProvider(args.provider || inferProvider(args.model) || cfg.default_provider || "glm");
}

function resolveRuntime(args, cfg) {
  const provider = providerOf(args, cfg);
  const pc = PROVIDERS[provider];
  const conf = (cfg.providers && cfg.providers[provider]) || {};
  let apiKey = args.api_key;
  if (!apiKey) {
    for (const k of pc.envKeys) {
      const v = process.env[k];
      if (v) { apiKey = v; break; }
    }
  }
  if (!apiKey) apiKey = conf.api_key;
  const model = args.model || conf.model || pc.defaultModel;
  if (!model) {
    throw new ApiError(`[${provider}] 没有内置默认模型，必须用 -m 指定。${pc.hint ? "\n" + pc.hint : ""}`);
  }
  return {
    provider,
    label: pc.label,
    apiKey,
    model,
    baseUrl: args.base_url || conf.base_url || pc.defaultBase,
    pc,
  };
}

function requireKey(apiKey, rt) {
  if (apiKey) return apiKey;
  const pc = rt.pc;
  throw new ApiError(
    `尚未配置 [${rt.provider}] 的 API Key，请任选其一：\n` +
    `  1. node llm_cli.js config set api-key --provider ${rt.provider}   （推荐）\n` +
    `  2. 设置环境变量 ${pc.envKeys[0]}\n` +
    `  3. 临时使用：--api-key <你的Key>\n` +
    `Key 获取：${pc.keyUrl}`
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
      detail = (obj.error && (obj.error.message || obj.error.msg)) || text.trim();
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
    if (rt.pc.supportsThinking) {
      payload.thinking = { type: args.thinking === "on" ? "enabled" : "disabled" };
    } else {
      console.error(`${colors.dim}(提示: --thinking 仅对智谱 GLM 生效，已忽略)${colors.reset}`);
    }
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
  requireKey(rt.apiKey, rt);

  let question = args._.join(" ").trim();
  if (!question && !process.stdin.isTTY) {
    try { question = fs.readFileSync(0, "utf8").trim(); } catch {}
  }
  if (args.file && args.file.length) {
    question = (question ? question + "\n\n" : "") + readQuestionFromFiles(args.file).join("\n\n");
  }
  if (!question) {
    throw new ApiError('请提供问题内容，例如：node llm_cli.js ask "你好"（或用管道传入；交互式多轮请用 chat 子命令）');
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
  "  /provider <名称>    临时切换供应商",
  "  /model <名称>       临时切换模型",
  "  /system <文本>      设置/更新 system 提示词（不带文本则清除）",
  "  /save [路径]        保存当前对话记录为 JSON",
  "  /exit              退出（或 Ctrl+C / Ctrl+D）",
].join("\n");

async function cmdChat(args, cfg) {
  const rt = resolveRuntime(args, cfg);
  requireKey(rt.apiKey, rt);

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

  console.log(`${colors.cyan}llm-cli ${VERSION} · ${rt.provider}(${rt.label}) · 模型 ${rt.model} · ${rt.baseUrl}${colors.reset}`);
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
        } else if (cmd === "/provider") {
          if (rest) {
            const p = normalizeProvider(rest);
            const pc = PROVIDERS[p];
            const conf = (cfg.providers && cfg.providers[p]) || {};
            let k = process.env[pc.envKeys[0]] || conf.api_key;
            if (!k) {
              console.log(`${colors.red}[${p}] 未配置 Key：config set api-key --provider ${p}${colors.reset}`);
            } else {
              rt.provider = p;
              rt.pc = pc;
              rt.apiKey = k;
              rt.baseUrl = conf.base_url || pc.defaultBase;
              rt.model = conf.model || pc.defaultModel;
              if (!rt.model) console.log(`${colors.dim}注意：[${p}] 无默认模型，请用 /model 指定。${colors.reset}`);
              console.log(`${colors.dim}已切换供应商: ${p} (${pc.label})${colors.reset}`);
            }
          } else {
            console.log(`当前供应商: ${rt.provider} (${rt.label})`);
          }
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
          fs.writeFileSync(file, JSON.stringify({ provider: rt.provider, model: rt.model, messages }, null, 2) + "\n", "utf8");
          console.log(`${colors.dim}对话已保存到 ${file}${colors.reset}`);
        } else {
          console.log(`${colors.dim}未知命令 ${cmd}，输入 /help 查看帮助。${colors.reset}`);
        }
        safePrompt();
        continue;
      }

      if (!rt.model) {
        console.log(`${colors.red}当前供应商没有默认模型，请先 /model <名称>。${colors.reset}`);
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
  requireKey(rt.apiKey, rt);
  const url = rt.baseUrl.replace(/\/+$/, "") + "/models";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(TIMEOUT_REASON), 60000);
  try {
    const resp = await apiFetch(url, rt.apiKey, null, "GET", controller.signal);
    const obj = await resp.json();
    const items = obj.data || [];
    if (!items.length) {
      console.log("服务端未返回模型列表。请直接用 -m 指定模型名，或查阅对应平台文档。");
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

  if (action === "list" || action === "providers") {
    for (const [id, pc] of Object.entries(PROVIDERS)) {
      const conf = (cfg.providers && cfg.providers[id]) || {};
      const model = conf.model || pc.defaultModel || "(需 -m 指定)";
      console.log(`${id.padEnd(13)} ${pc.label.padEnd(18)} key:${conf.api_key || process.env[pc.envKeys[0]] ? "已配" : "未配"}  默认模型: ${model}`);
    }
    console.log(`默认供应商: ${cfg.default_provider || "glm"}`);
    return;
  }

  if (action === "get") {
    console.log(`配置文件      : ${CONFIG_FILE}`);
    console.log(`默认供应商    : ${cfg.default_provider || "glm"}`);
    for (const [id, pc] of Object.entries(PROVIDERS)) {
      const conf = (cfg.providers && cfg.providers[id]) || {};
      if (!conf.api_key && !conf.model && !conf.base_url) continue;
      console.log(`[${id}]`);
      console.log(`  api_key  : ${mask(conf.api_key)}`);
      console.log(`  model    : ${conf.model || `(默认 ${pc.defaultModel || "需 -m 指定"})`}`);
      console.log(`  base_url : ${conf.base_url || `(默认 ${pc.defaultBase})`}`);
    }
    return;
  }

  const items = { "api-key": "api_key", model: "model", "base-url": "base_url" };

  if (action === "set") {
    if (item === "provider") {
      const key = normalizeProvider(value);
      cfg.default_provider = key;
      saveConfig(cfg);
      console.log(`已设置默认供应商: ${key}（${PROVIDERS[key].label}）`);
      return;
    }
    if (!item || !(item in items)) throw new ApiError("支持设置: api-key / model / base-url / provider");
    const provider = providerOf(args, cfg);
    let v = value;
    if (item === "api-key" && !v) v = await promptHidden(`请输入 [${provider}] 的 API Key（输入不会回显）: `);
    v = (v || "").trim();
    if (!v) throw new ApiError(`缺少 ${item} 的值，例如: node llm_cli.js config set ${item} <值> --provider ${provider}`);
    cfg.providers = cfg.providers || {};
    cfg.providers[provider] = cfg.providers[provider] || {};
    cfg.providers[provider][items[item]] = v;
    saveConfig(cfg);
    console.log(`已保存到 [${provider}]。配置文件: ${CONFIG_FILE}`);
    return;
  }

  if (action === "del") {
    if (!item || !(item in items)) throw new ApiError("支持删除: api-key / model / base-url");
    const provider = providerOf(args, cfg);
    if (cfg.providers && cfg.providers[provider]) delete cfg.providers[provider][items[item]];
    saveConfig(cfg);
    console.log(`已删除 [${provider}] 的 ${item}。`);
    return;
  }

  throw new ApiError("用法: config set|get|del|list|path");
}

// ---------------------------------------------------------------- 命令行入口

const ALIASES = {
  "-m": "model", "--model": "model",
  "-p": "provider", "--provider": "provider",
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
  const rows = Object.entries(PROVIDERS)
    .map(([id, pc]) => `  ${id.padEnd(13)} ${pc.label.padEnd(18)} ${pc.defaultModel || "(需 -m)"}`)
    .join("\n");
  console.log(`llm-cli ${VERSION} —— 多供应商终端客户端（零依赖，Node.js >= 18）

用法: node llm_cli.js <command> [参数] [选项]

命令:
  ask      单次提问: node llm_cli.js ask "问题"
  chat     多轮交互对话（支持 /provider /model /system /save）
  models   列出当前账号可用的模型
  config   管理本地配置: set/get/del/list/path

供应商 (-p/--provider，默认 glm，也可按模型名前缀自动推断):
${rows}

选项:
  -m, --model <名称>       模型名（无默认模型的供应商必须指定）
  -p, --provider <名称>    供应商
  --api-key <Key>          本次使用的 API Key（优先级最高）
  --base-url <地址>        接口地址
  --system <文本>          system 提示词
  -t, --temperature <值>   采样温度
  --max-tokens <数量>      最大输出 token 数
  --thinking <on|off>      深度思考开关（仅智谱 GLM 生效）
  --no-stream              关闭流式输出
  --no-color / --debug     关闭彩色 / 调试输出

示例:
  node llm_cli.js config set api-key -p mimo
  node llm_cli.js config list                     # 查看所有供应商配置状态
  node llm_cli.js ask "用一句话解释量子纠缠"
  node llm_cli.js ask -m deepseek-v4-pro "推理题" # 模型名前缀自动选 DeepSeek
  node llm_cli.js chat -p kimi
  node llm_cli.js models -p glm
  type report.txt | node llm_cli.js ask "总结这份文档"`);
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { opts.help = true; continue; }
    if (a === "-V" || a === "--version") { console.log(`llm-cli ${VERSION}`); process.exit(0); }
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
