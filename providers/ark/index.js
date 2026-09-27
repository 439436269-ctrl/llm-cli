"use strict";
// 火山方舟 Ark（豆包）供应商定义（模型为接入点 ID 或 doubao-* 名称）。
module.exports = {
  label: "火山方舟 Ark（豆包）",
  defaultBase: "https://ark.cn-beijing.volces.com/api/v3",
  defaultModel: null,
  envKeys: ["ARK_API_KEY"],
  keyUrl: "https://console.volcengine.com/ark -> API Key",
  hint: "模型为接入点 ID 或 doubao-* 名称，需用 -m 指定",
  supportsThinking: false,
  prefixes: ["ark", "doubao"],
};
