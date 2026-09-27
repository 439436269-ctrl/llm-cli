"use strict";
// HTTP 请求（fetch 封装 + 错误映射）与 SSE 流解析。
const { ApiError, friendlyHTTPError } = require("./errors");

const STREAM_IDLE_MS = 120000; // 流式模式下两次数据块之间的最大等待（毫秒）
const PLAIN_MS = 300000;       // 非流式模式的整体等待（毫秒）
const TIMEOUT_REASON = "llm-cli-idle-timeout";

function isAbort(err) {
  return err && (err.name === "AbortError" || err.code === "ABORT_ERR");
}

async function apiFetch(url, apiKey, payload, method, signal, hints) {
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
  if (!resp.ok) throw new ApiError(await friendlyHTTPError(resp, hints));
  return resp;
}

// 解析 OpenAI 风格 SSE：逐行产出 data: 负载，遇到 [DONE] 结束
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

module.exports = { STREAM_IDLE_MS, PLAIN_MS, TIMEOUT_REASON, isAbort, apiFetch, iterSSE };
