# llm-cli —— GLM / DeepSeek 终端命令行客户端

两个**零依赖**单文件脚本（Node.js ≥ 18），各连一家服务商；API Key 均由你本人手动填写，代码中不内置任何密钥。

| 脚本 | 服务商 | 默认模型 | 配置目录 | Key 环境变量 |
|---|---|---|---|---|
| `glm_cli.js` | 智谱 GLM | `glm-5.3-flash` | `~/.glm-cli` | `GLM_API_KEY`（或 `ZHIPUAI_API_KEY`） |
| `deepseek_cli.js` | DeepSeek | `deepseek-chat` | `~/.deepseek-cli` | `DEEPSEEK_API_KEY` |

Windows 下可用同目录的 `glm.bat` / `deepseek.bat` 启动，例如 `.\glm.bat chat`。

## 安装（npm）

```bash
npm i -g @vfvrpq/llm-cli   # 全局安装，得到 glm-cli 与 deepseek-cli 两个命令
glm-cli --help

# 免安装直接运行
npx -p @vfvrpq/llm-cli glm-cli ask "你好"

# 或免 npm：下载仓库后直接运行
node glm_cli.js ask "你好"
```

下文示例中的 `node glm_cli.js` / `node deepseek_cli.js` 在全局安装后可分别换成 `glm-cli` / `deepseek-cli`。

## 准备 API Key

- GLM（智谱）：<https://open.bigmodel.cn> 控制台 → API Key（海外版 <https://z.ai>）
- DeepSeek：<https://platform.deepseek.com> → API Keys

## 快速开始

```bash
# GLM
node glm_cli.js config set api-key
node glm_cli.js ask "用一句话解释量子纠缠"
node glm_cli.js chat
node glm_cli.js models

# DeepSeek
node deepseek_cli.js config set api-key
node deepseek_cli.js ask "用一句话介绍你自己"
node deepseek_cli.js ask "九个点如何四条线相连" -m deepseek-reasoner
node deepseek_cli.js models
```

## 常用示例（两个脚本一致）

```bash
# 附带文件提问（可多个 -f）
node glm_cli.js ask -f main.js "这个脚本有什么问题？"

# 管道输入（Windows 用 type，macOS/Linux 用 cat）
type error.log | node deepseek_cli.js ask "总结这个报错"

# 回答保存到文件
node glm_cli.js ask "写一首关于秋天的诗" -o poem.txt

# 多轮对话：指定模型/温度，继续上次对话
node glm_cli.js chat -m glm-4.6 -t 0.7
node deepseek_cli.js chat --resume chat-latest.json
```

`chat` 中的斜杠命令：`/help` `/new` `/model <名称>` `/system <文本>` `/save [路径]` `/exit`

## 参数说明（两个脚本一致）

| 参数 | 作用 |
|---|---|
| `-m, --model` | 模型名（默认值见上表） |
| `--api-key` | 本次使用的 Key（优先级最高） |
| `--base-url` | 接口地址 |
| `--system` | system 提示词 |
| `-t, --temperature` | 采样温度 |
| `--max-tokens` | 最大输出 token 数 |
| `--thinking on/off` | 深度思考开关（**仅 glm_cli.js**；`deepseek-reasoner` 自带思考无需设置） |
| `--no-stream` | 关闭流式输出 |
| `--no-color` / `--debug` | 关闭彩色 / 输出调试信息 |

配置优先级：命令行参数 > 环境变量 > 配置文件 > 内置默认值。
配置持久化：`config set model/base-url`、`config get`（Key 脱敏显示）、`config del`、`config path`。

## 常见问题

- **401 未授权**：Key 没填、填错或未生效，重新 `config set api-key`。
- **402（DeepSeek）**：账户余额不足，去平台充值。
- **429 限流**：请求太频繁或额度不足，稍后再试。
- **超时**：流式模式等待间隔上限 120 秒、非流式整体 300 秒。
- **代理**：Node 的 fetch 默认不走 `HTTP_PROXY`/`HTTPS_PROXY`（Node ≥ 24 可设 `NODE_USE_ENV_PROXY=1`）。
- **GLM 海外站**：`node glm_cli.js config set base-url https://api.z.ai/api/paas/v4`。
- **安全**：Key 以明文存在本机配置文件（macOS/Linux 下权限 600），请勿分享该文件。
