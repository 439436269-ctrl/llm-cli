"use strict";
// 终端隐藏输入（保存 API Key 时回显关闭）。
const readline = require("node:readline");
const { Writable } = require("node:stream");

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const rl = readline.createInterface({ input: process.stdin, output: sink, terminal: true });
    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      rl.close();
      process.stderr.write("\n");
      resolve(String(answer || "").trim());
    };
    rl.on("close", () => finish(""));
    rl.question("", finish);
  });
}

module.exports = { promptHidden };
