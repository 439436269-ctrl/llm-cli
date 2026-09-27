"use strict";
// DeepSeek 供应商定义。
module.exports = {
  label: "DeepSeek",
  defaultBase: "https://api.deepseek.com/v1",
  defaultModel: "deepseek-flash",
  envKeys: ["DEEPSEEK_API_KEY"],
  keyUrl: "https://platform.deepseek.com -> API Keys",
  hint: "当前账号可用：deepseek-flash / deepseek-v4-pro",
  supportsThinking: false,
  prefixes: ["deepseek"],
};
