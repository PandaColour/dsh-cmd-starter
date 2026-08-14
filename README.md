# dsh-cmd-starter

Claude-Code 风格的 DeepSeek Harness 无头调度 bundle。它在官方 `@deepseek-ai/dsh-headless` profile 之上，把一次性任务入口升级成可脚本化的 CLI：

- `--append-prompt <text>`：本次运行临时追加系统提示词（可重复；不落盘、不进会话历史）
- `--resume <session-id>`：恢复已有会话（支持 id 或 `--name` 别名）
- `-c, --continue`：续最近的会话
- `--name <name>`：给会话起持久化别名，之后 `--resume <name>` 恢复
- `--output-format json`：stdout 输出单行 JSON，含 `sessionId`
- `--provider / --model / --max-tokens / --effort`：覆盖本次运行的模型参数

## 为什么做这个

这个插件是为了支持 [panda-pipline](https://github.com/PandaColour/panda-pipline) 而开发的。`panda-pipline` 是一个用 Python 直接驱动 Claude / Codex / Cursor 这类编码 agent，把它们编排成流水线干活的框架。

`dsh-cmd-starter` 的角色，是让 **DeepSeek Harness** 也能被同一套 Python 流水线驱动——通过补齐 Claude-Code 风格的 `--resume` / `--continue` / `--name` / `--append-prompt` / `--output-format json` 调度参数，使 `dsh` 在 Python 眼里和 `claude` / `codex` / `cursor` 一样，是一个「可以用 `subprocess.Popen` 启动、带结构化输出、能按会话恢复」的可编排单元。

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

# 命名会话，之后按名字恢复
dsh --profile headless --name review "review this PR"
dsh --profile headless --resume review "continue the review"

# 覆盖模型参数
dsh --profile headless --provider deepseek-official --model deepseek-v4-flash --max-tokens 8192 "task"
```

## 与 Claude CLI 的对应关系

| Claude CLI | dsh-cmd-starter |
|---|---|
| `claude -p "prompt"` | `dsh --profile headless "prompt"` |
| `claude -r <name>` | `dsh --profile headless --resume <session-id-or-name>` |
| `claude -c` | `dsh --profile headless -c "..."` |
| `claude -n, --name <name>` | `dsh --profile headless --name <name> "..."` |
| `claude --append-system-prompt <t>` | `dsh --profile headless --append-prompt <t>` |
| `claude --output-format json` | `dsh --profile headless --output-format json` |
| `claude --model <m>` | `dsh --profile headless --provider <p> --model <m>` |

## 语义说明

- **`--append-prompt` 是临时的**：通过 agent 作用域的 `systemPrompt.section()` 注入，进程退出即消失，绝不写入 session 日志。连续两次运行互不残留；只有 `--resume`/`-c` 才会延续对话历史。
- **`--name` 的别名是持久的**：存在 `$DSH_HOME/cmd-starter/aliases.json`（原子写），跨进程有效。`--resume <value>` 先查别名表，命中就映射到 session id，未命中就把 `<value>` 当 session id。别名只指向 session，不进入会话历史。
- **`--output-format json` 的字段**（命名对齐 SDK 协议）：`sessionId`（驼峰）、`name`（仅 `--name` 时）、`finalResponse`、`finishReason`（`completed | max-tokens | blocked | aborted | error`）、`errorCode`（仅 error 时）。

## Python 调度

见 [`examples/schedule.py`](examples/schedule.py)。

## 感谢支持

![谢谢支持](weixin.jpg)
联系方式: <panda.colour@qq.com>
