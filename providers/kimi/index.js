"use strict";
// Kimi（月之暗面）供应商定义。端点参考 cc-switch codexProviderPresets。
module.exports = {
  label: "Kimi（月之暗面）",
  defaultBase: "https://api.moonshot.cn/v1",
  defaultModel: "kimi-latest",
  envKeys: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
  keyUrl: "https://platform.moonshot.cn -> API Key",
  hint: "默认 kimi-latest（自动指向最新模型）",
  supportsThinking: false,
  prefixes: ["kimi", "moonshot"],
};
