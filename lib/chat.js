"use strict";
// 对话调用：payload 构建（thinking 门控）、流式/非流式执行与实时渲染。
const { ApiError } = require("./errors");
const { colors } = require("./colors");
const { STREAM_IDLE_MS, PLAIN_MS, TIMEOUT_REASON, isAbort, apiFetch, iterSSE } = require("./http");

const state = { currentAbort: null };

function buildPayload(rt, messages, args, ctx) {
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
    const resp = await apiFetch(url, rt.apiKey, payload, "POST", controller.signal, rt.hints);
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

module.exports = { state, buildPayload, chatCompletion, printUsageLine };
