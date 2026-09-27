"use strict";
// 智谱 GLM 供应商定义。修改供应商（端点/默认模型/Key 环境变量）只动本文件。
module.exports = {
  label: "智谱 GLM",
  defaultBase: "https://open.bigmodel.cn/api/paas/v4",
  defaultModel: "glm-5.3-flash",
  envKeys: ["GLM_API_KEY", "ZHIPUAI_API_KEY", "ZHIPU_API_KEY"],
  keyUrl: "https://open.bigmodel.cn 控制台 -> API Key",
  hint: "可用模型：glm-5.3-flash / glm-5.3 / glm-4.6 / glm-4.7 等（coding 订阅端点见 README）",
  supportsThinking: true,
  prefixes: ["glm"],
};
