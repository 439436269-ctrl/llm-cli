"use strict";
// models 子命令：GET /models 列出当前账号可用的模型。
const { ApiError } = require("../errors");
const { resolveRuntime, requireKey } = require("../registry");
const { TIMEOUT_REASON, isAbort, apiFetch } = require("../http");

async function models(args, cfg, ctx) {
  const rt = resolveRuntime(args, cfg, ctx);
  requireKey(rt.apiKey, rt);
  const url = rt.baseUrl.replace(/\/+$/, "") + "/models";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(TIMEOUT_REASON), 60000);
  try {
    const resp = await apiFetch(url, rt.apiKey, null, "GET", controller.signal, rt.hints);
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

module.exports = models;
