"use strict";
// 小米 MiMo 供应商定义（端点与模型清单 2026-09 实测）。
module.exports = {
  label: "小米 MiMo",
  defaultBase: "https://api.xiaomimimo.com/v1",
  defaultModel: "mimo-v2.6-flash",
  envKeys: ["MIMO_API_KEY", "XIAOMI_API_KEY"],
  keyUrl: "https://platform.xiaomimimo.com",
  hint: "可用模型：mimo-v2.6-flash / mimo-v2.6-pro / mimo-v2.5 等",
  supportsThinking: false,
  prefixes: ["mimo"],
};
