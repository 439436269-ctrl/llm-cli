"use strict";
// chat 子命令：多轮交互对话（REPL + 斜杠命令 + Ctrl+C 中断单次回复）。
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { ApiError } = require("../errors");
const { colors } = require("../colors");
const { resolveRuntime, requireKey, normalizeProvider } = require("../registry");
const { buildPayload, chatCompletion, printUsageLine, state } = require("../chat");

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

async function chat(args, cfg, ctx) {
  const rt = resolveRuntime(args, cfg, ctx);
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

  console.log(`${colors.cyan}${ctx.entry.name} ${ctx.entry.version} · ${rt.provider}(${rt.label}) · 模型 ${rt.model} · ${rt.baseUrl}${colors.reset}`);
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
          if (!ctx.features.provider) {
            console.log(`${colors.dim}当前入口不支持切换供应商。${colors.reset}`);
          } else if (rest) {
            const p = normalizeProvider(rest, ctx.registry);
            const pc = ctx.registry[p];
            const conf = (cfg.providers && cfg.providers[p]) || {};
            const k = process.env[pc.envKeys[0]] || conf.api_key;
            if (!k) {
              console.log(`${colors.red}[${p}] 未配置 Key：config set api-key --provider ${p}${colors.reset}`);
            } else {
              rt.provider = p;
              rt.pc = pc;
              rt.apiKey = k;
              rt.baseUrl = conf.base_url || pc.defaultBase;
              rt.model = conf.model || pc.defaultModel;
              rt.hints = { ...rt.hints, ...(pc.hints || {}) };
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
          const file = rest || ctx.historyFile;
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
        const { content, usage } = await chatCompletion(rt, buildPayload(rt, messages, args, ctx));
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

module.exports = chat;
