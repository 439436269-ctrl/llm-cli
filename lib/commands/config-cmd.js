"use strict";
// config 子命令：set/get/del/(list)/path。多供应商入口才支持 provider 项与 list。
const { ApiError } = require("../errors");
const { promptHidden } = require("../hidden");
const { mask, providerOf } = require("../registry");

async function configCmd(args, cfg, ctx) {
  const [action, item, value] = args._;
  const multi = ctx.features.provider;

  if (action === "path") {
    console.log(ctx.configFile);
    return;
  }

  if (action === "list") {
    if (!multi) throw new ApiError("用法: config set|get|del|path");
    for (const [id, pc] of Object.entries(ctx.registry)) {
      const conf = (cfg.providers && cfg.providers[id]) || {};
      const configured = conf.api_key || process.env[pc.envKeys[0]];
      const model = conf.model || pc.defaultModel || "(需 -m 指定)";
      console.log(`${id.padEnd(13)} ${pc.label.padEnd(18)} key:${configured ? "已配" : "未配"}  默认模型: ${model}`);
    }
    console.log(`默认供应商: ${cfg.default_provider || Object.keys(ctx.registry)[0]}`);
    return;
  }

  if (action === "get") {
    if (multi) {
      console.log(`配置文件      : ${ctx.configFile}`);
      console.log(`默认供应商    : ${cfg.default_provider || Object.keys(ctx.registry)[0]}`);
      for (const [id, pc] of Object.entries(ctx.registry)) {
        const conf = (cfg.providers && cfg.providers[id]) || {};
        if (!conf.api_key && !conf.model && !conf.base_url) continue;
        console.log(`[${id}]`);
        console.log(`  api_key  : ${mask(conf.api_key)}`);
        console.log(`  model    : ${conf.model || `(默认 ${pc.defaultModel || "需 -m 指定"})`}`);
        console.log(`  base_url : ${conf.base_url || `(默认 ${pc.defaultBase})`}`);
      }
    } else {
      const pc = ctx.registry[ctx.fixedProvider];
      const conf = (cfg.providers && cfg.providers[ctx.fixedProvider]) || {};
      console.log(`配置文件 : ${ctx.configFile}`);
      console.log(`api_key  : ${mask(conf.api_key)}`);
      console.log(`model    : ${conf.model || `(默认 ${pc.defaultModel})`}`);
      console.log(`base_url : ${conf.base_url || `(默认 ${pc.defaultBase})`}`);
    }
    return;
  }

  const items = { "api-key": "api_key", model: "model", "base-url": "base_url" };

  if (action === "set") {
    if (item === "provider") {
      if (!multi) throw new ApiError("支持设置: api-key / model / base-url");
      const key = providerOf({ provider: value }, cfg, ctx);
      cfg.default_provider = key;
      ctx.saveCfg(cfg);
      console.log(`已设置默认供应商: ${key}（${ctx.registry[key].label}）`);
      return;
    }
    if (!item || !(item in items)) {
      throw new ApiError(multi ? "支持设置: api-key / model / base-url / provider" : "支持设置: api-key / model / base-url");
    }
    const provider = providerOf(args, cfg, ctx);
    let v = value;
    if (item === "api-key" && !v) v = await promptHidden(`请输入 [${provider}] 的 API Key（输入不会回显）: `);
    v = (v || "").trim();
    if (!v) throw new ApiError(`缺少 ${item} 的值，例如: config set ${item} <值>${multi ? ` --provider ${provider}` : ""}`);
    cfg.providers = cfg.providers || {};
    cfg.providers[provider] = cfg.providers[provider] || {};
    cfg.providers[provider][items[item]] = v;
    ctx.saveCfg(cfg);
    console.log(multi
      ? `已保存到 [${provider}]。配置文件: ${ctx.configFile}`
      : `已保存。配置文件: ${ctx.configFile}`);
    return;
  }

  if (action === "del") {
    if (!item || !(item in items)) throw new ApiError("支持删除: api-key / model / base-url");
    const provider = providerOf(args, cfg, ctx);
    if (cfg.providers && cfg.providers[provider]) delete cfg.providers[provider][items[item]];
    ctx.saveCfg(cfg);
    console.log(multi ? `已删除 [${provider}] 的 ${item}。` : "已删除。");
    return;
  }

  throw new ApiError(multi ? "用法: config set|get|del|list|path" : "用法: config set|get|del|path");
}

module.exports = configCmd;
