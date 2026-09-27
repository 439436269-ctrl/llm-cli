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

## 多供应商 llm-cli（v1.1 新增）

`llm_cli.js`（bin `llm-cli`）把多家供应商收进一个脚本，配置目录 `~/.llm-cli`：

| 供应商 | 默认端点 | 默认模型 | Key 环境变量 |
|---|---|---|---|
| `glm` 智谱 | `open.bigmodel.cn/api/paas/v4` | `glm-5.3-flash` | `GLM_API_KEY` |
| `deepseek` | `api.deepseek.com/v1` | `deepseek-flash` | `DEEPSEEK_API_KEY` |
| `mimo` 小米 | `api.xiaomimimo.com/v1` | `mimo-v2.6-flash` | `MIMO_API_KEY` |
| `kimi` 月之暗面 | `api.moonshot.cn/v1` | `kimi-latest` | `MOONSHOT_API_KEY` |
| `siliconflow` 硅基流动 | `api.siliconflow.cn/v1` | 需 `-m` 指定 | `SILICONFLOW_API_KEY` |
| `ark` 火山方舟（豆包） | `ark.cn-beijing.volces.com/api/v3` | 需 `-m` 指定 | `ARK_API_KEY` |
| `openai` | `api.openai.com/v1` | 需 `-m` 指定 | `OPENAI_API_KEY` |

```bash
node llm_cli.js config set api-key -p mimo       # 按供应商保存 Key
node llm_cli.js config list                       # 查看全部配置状态
node llm_cli.js ask "你好"                        # 默认走 glm
node llm_cli.js ask -m deepseek-v4-pro "推理题"   # 按模型名前缀自动选供应商
node llm_cli.js chat -p kimi                      # 指定供应商
node llm_cli.js models -p mimo                    # 查看该账号可用模型
```

- 供应商选择优先级：`-p` > 模型名前缀推断 > `config set provider` > 默认 `glm`
- 智谱 coding 订阅（本机 MiMo 同款配置）：`--base-url https://open.bigmodel.cn/api/coding/paas/v4`
- 端点与模型清单均已实测；cc-switch（farion1231/cc-switch）的 OpenAI 兼容端点清单是本表的参考来源

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
