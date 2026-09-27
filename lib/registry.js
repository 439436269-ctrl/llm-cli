"use strict";
// 供应商注册表操作：选择、模型名推断、运行时解析、Key 解析与掩码。
const { ApiError, DEFAULT_HINTS } = require("./errors");

function normalizeProvider(p, registry) {
  const key = String(p || "").trim().toLowerCase();
  const alias = { zhipu: "glm", moonshot: "kimi", xiaomi: "mimo", volc: "ark" };
  const name = alias[key] || key;
  if (!registry[name]) {
    throw new ApiError(`未知供应商 "${p}"，可选：${Object.keys(registry).join(" / ")}`);
  }
  return name;
}

// 没显式指定 --provider 时，按模型名前缀推断（如 glm-* / deepseek-* / mimo-*）
function inferProvider(model, registry) {
  const m = String(model || "").toLowerCase();
  for (const [id, pc] of Object.entries(registry)) {
    if ((pc.prefixes || []).some((p) => m.startsWith(p))) return id;
  }
  return null;
}

function providerOf(args, cfg, ctx) {
  if (ctx.fixedProvider) return ctx.fixedProvider;
  if (args.provider) return normalizeProvider(args.provider, ctx.registry);
  const inferred = ctx.features.provider ? inferProvider(args.model, ctx.registry) : null;
  const fallback = cfg.default_provider || Object.keys(ctx.registry)[0];
  return normalizeProvider(inferred || fallback, ctx.registry);
}

function resolveRuntime(args, cfg, ctx) {
  const provider = providerOf(args, cfg, ctx);
  const pc = ctx.registry[provider];
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
    hints: { ...DEFAULT_HINTS, ...(pc.hints || {}) },
  };
}

function requireKey(apiKey, rt) {
  if (apiKey) return apiKey;
  const pc = rt.pc;
  throw new ApiError(
    `尚未配置 [${rt.provider}] 的 API Key，请任选其一：\n` +
    `  1. config set api-key${` --provider ${rt.provider}`}   （推荐）\n` +
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

module.exports = { normalizeProvider, inferProvider, providerOf, resolveRuntime, requireKey, mask };
