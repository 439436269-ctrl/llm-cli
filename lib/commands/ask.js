"use strict";
// ask 子命令：单次提问（位置参数 / 管道 / 附带文件 / 保存回答）。
const fs = require("node:fs");
const path = require("node:path");
const { ApiError } = require("../errors");
const { colors } = require("../colors");
const { resolveRuntime, requireKey } = require("../registry");
const { buildPayload, chatCompletion, printUsageLine } = require("../chat");

function readQuestionFromFiles(files) {
  return files.map((fp) => {
    let text;
    try {
      text = fs.readFileSync(fp, "utf8");
    } catch (e) {
      throw new ApiError(`无法读取文件 ${fp}：${e.message}`);
    }
    return `文件 \`${path.basename(fp)}\` 内容：\n\`\`\`\n${text}\n\`\`\``;
  });
}

async function ask(args, cfg, ctx) {
  const rt = resolveRuntime(args, cfg, ctx);
  requireKey(rt.apiKey, rt);

  let question = args._.join(" ").trim();
  if (!question && !process.stdin.isTTY) {
    try { question = fs.readFileSync(0, "utf8").trim(); } catch {}
  }
  if (args.file && args.file.length) {
    question = (question ? question + "\n\n" : "") + readQuestionFromFiles(args.file).join("\n\n");
  }
  if (!question) {
    throw new ApiError(`请提供问题内容，例如：node ${ctx.entry.file} ask "你好"（或用管道传入；交互式多轮请用 chat 子命令）`);
  }

  const messages = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: question });

  const { content, usage } = await chatCompletion(rt, buildPayload(rt, messages, args, ctx));
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, content, "utf8");
    console.log(`${colors.dim}回答已保存到 ${args.output}${colors.reset}`);
  }
  printUsageLine(usage);
}

module.exports = ask;
