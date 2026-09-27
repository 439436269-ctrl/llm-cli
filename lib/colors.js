"use strict";
// 终端颜色输出：仅在 TTY 且未显式禁用时启用 ANSI。
const colors = { dim: "", bold: "", red: "", green: "", cyan: "", reset: "" };

function enableColors(noColor) {
  if (noColor || process.env.NO_COLOR || !process.stdout.isTTY) return;
  colors.dim = "\x1b[2m";
  colors.bold = "\x1b[1m";
  colors.red = "\x1b[31m";
  colors.green = "\x1b[32m";
  colors.cyan = "\x1b[36m";
  colors.reset = "\x1b[0m";
}

module.exports = { colors, enableColors };
