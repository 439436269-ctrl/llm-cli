"use strict";
// 供应商聚合注册表：新增供应商 = 在 providers/ 下建文件夹 + 在此登记一行。
// 顺序即默认优先级（第一个是兜底默认供应商）。
const ALL = {
  glm: require("./glm"),
  deepseek: require("./deepseek"),
  mimo: require("./mimo"),
  kimi: require("./kimi"),
  siliconflow: require("./siliconflow"),
  ark: require("./ark"),
  openai: require("./openai"),
};

module.exports = { ALL };
