"use strict";
// OpenAI 供应商定义。
module.exports = {
  label: "OpenAI",
  defaultBase: "https://api.openai.com/v1",
  defaultModel: null,
  envKeys: ["OPENAI_API_KEY"],
  keyUrl: "https://platform.openai.com -> API keys",
  hint: "需用 -m 指定模型（如 gpt-*）",
  supportsThinking: false,
  prefixes: ["gpt"],
};
