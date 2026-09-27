"use strict";
// 错误类型与 HTTP 错误的用户可读映射。
class ApiError extends Error {}

const DEFAULT_HINTS = {
  401: "API Key 缺失、无效或未生效。请执行: config set api-key（多供应商时加 --provider）",
  403: "当前 Key 无权访问该模型，或账户余额不足。",
  404: "模型名或接口地址可能有误：用 -m/--model 指定模型，--base-url 指定接口地址。",
  402: "账户余额不足，请前往对应平台充值。",
  429: "请求过于频繁，或额度/资源包不足，请稍后再试。",
};

// 把 HTTP 错误响应转成带提示的可读消息；hints 可被供应商覆盖
async function friendlyHTTPError(resp, hints = DEFAULT_HINTS) {
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
  const hint = hints[resp.status];
  if (hint) msg += `\n提示：${hint}`;
  return msg;
}

module.exports = { ApiError, DEFAULT_HINTS, friendlyHTTPError };
