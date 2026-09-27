"use strict";
// 硅基流动 SiliconFlow 供应商定义（模型库丰富，无统一默认模型，需 -m 指定）。
module.exports = {
  label: "硅基流动 SiliconFlow",
  defaultBase: "https://api.siliconflow.cn/v1",
  defaultModel: null,
  envKeys: ["SILICONFLOW_API_KEY"],
  keyUrl: "https://cloud.siliconflow.cn -> API 密钥",
  hint: "模型名形如 deepseek-ai/DeepSeek-V3.1，需用 -m 指定",
  supportsThinking: false,
  prefixes: ["siliconflow"],
};
