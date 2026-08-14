# dsh-cmd-starter

Claude-Code 风格的 DeepSeek Harness 无头调度 bundle。它在官方 `@deepseek-ai/dsh-headless` profile 之上，把一次性任务入口升级成可脚本化的 CLI：

- `--append-prompt <text>`：本次运行临时追加系统提示词（可重复；不落盘、不进会话历史）
- `--resume <session-id>`：恢复已有会话
- `-c, --continue`：续最近的会话
- `--output-format json`：stdout 输出单行 JSON，含 `sessionId`
- `--provider / --model / --max-tokens / --effort`：覆盖本次运行的模型参数

## 安装

要求：Node `^22.19 || >=24`，已全局安装 `dsh`（`npm i -g @deepseek-ai/dsh@next`）。

```sh
dsh plugin --profile headless add github:PandaColour/dsh-cmd-starter
```

> 首次 `add` 若因 pnpm 的 `allowBuilds` 拦截，按提示在
> `~/.dsh/profiles/headless/pnpm-workspace.yaml` 里补 `allowBuilds` 键后重跑。

## 用法

```sh
# 一次性任务（等价官方 headless）
dsh --profile headless "run the tests"

# 本次运行临时加一条系统提示词（可多次 --append-prompt）
dsh --profile headless --append-prompt "be terse" "explain this code"

# 输出 JSON，含 sessionId（供 Python 抓取）
dsh --profile headless --output-format json "run the tests"
# => {"sessionId":"session-xxx","finalResponse":"...","finishReason":"completed"}

# 恢复会话 / 续最近会话
dsh --profile headless --resume session-xxx "continue"
dsh --profile headless -c "continue"

# 覆盖模型参数
dsh --profile headless --provider deepseek-official --model deepseek-v4-flash --max-tokens 8192 "task"
```

## 与 Claude CLI 的对应关系

| Claude CLI | dsh-cmd-starter |
|---|---|
| `claude -p "prompt"` | `dsh --profile headless "prompt"` |
| `claude -r <name>` | `dsh --profile headless --resume <session-id>` |
| `claude -c` | `dsh --profile headless -c "..."` |
| `claude --append-system-prompt <t>` | `dsh --profile headless --append-prompt <t>` |
| `claude --output-format json` | `dsh --profile headless --output-format json` |
| `claude --model <m>` | `dsh --profile headless --provider <p> --model <m>` |

## 语义说明

- **`--append-prompt` 是临时的**：通过 agent 作用域的 `systemPrompt.section()` 注入，进程退出即消失，绝不写入 session 日志。连续两次运行互不残留；只有 `--resume`/`-c` 才会延续对话历史。
- **`--output-format json` 的字段**（命名对齐 SDK 协议）：`sessionId`（驼峰）、`finalResponse`、`finishReason`（`completed | max-tokens | blocked | aborted | error`）、`errorCode`（仅 error 时）。

## Python 调度

见 [`examples/schedule.py`](examples/schedule.py)。
