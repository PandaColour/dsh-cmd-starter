#!/usr/bin/env python3
"""Python Popen scheduling for dsh-cmd-starter.

Uses `dsh --profile headless --output-format json` so every run returns the
session id, which a later `--resume` / `-c` / `--name` reuses. No Python SDK
needed. The `RunResult` shape mirrors `panda-pipline`'s `AgentRunResult`
(`text` / `session_id` / `returncode` / `error`), so the two can share a
driver contract.
"""

import json
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RunResult:
    """Mirror of panda-pipline.agents._result.AgentRunResult."""
    text: str
    session_id: Optional[str]
    returncode: int
    error: Optional[str] = None


class Dsh:
    def __init__(self, profile: str = "headless"):
        self.profile = profile
        self.last_session_id: Optional[str] = None

    def run(
        self,
        task: str,
        append_prompt: Optional[list[str]] = None,
        resume: Optional[str] = None,
        continue_latest: bool = False,
        name: Optional[str] = None,
        cwd: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        effort: Optional[str] = None,
        timeout: int = 900,
    ) -> RunResult:
        args = ["dsh", "--profile", self.profile, "--output-format", "json"]
        for prompt in append_prompt or []:
            args += ["--append-prompt", prompt]
        if resume is not None:
            args += ["--resume", resume]
        if continue_latest:
            args += ["--continue"]
        if name is not None:
            args += ["--name", name]
        if provider is not None:
            args += ["--provider", provider]
        if model is not None:
            args += ["--model", model]
        if max_tokens is not None:
            args += ["--max-tokens", str(max_tokens)]
        if effort is not None:
            args += ["--effort", effort]
        args.append(task)

        try:
            proc = subprocess.run(args, capture_output=True, text=True, cwd=cwd, timeout=timeout)
        except Exception as error:
            return RunResult("", self.last_session_id, -1, str(error))

        data = _find_result_line(proc.stdout)
        text = data.get("finalResponse") or "" if data else ""
        session_id = (data.get("sessionId") if data else None) or self.last_session_id
        error = None if proc.returncode == 0 else proc.stderr.strip() or proc.stdout.strip() or (
            f"dsh exited with code {proc.returncode}"
        )
        self.last_session_id = session_id
        return RunResult(text, session_id, proc.returncode, error)


def _find_result_line(stdout: str) -> Optional[dict]:
    """Find the JSON line carrying `sessionId` in dsh's combined output."""
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and "sessionId" in data:
            return data
    return None


if __name__ == "__main__":
    d = Dsh()

    # 1. 首次运行：新建会话，拿到 session id
    r1 = d.run("分析 src/ 目录结构并总结", append_prompt=["be concise"])
    print("first sessionId:", r1.session_id)
    print("response:", r1.text[:200])

    # 2. 续上同一个会话
    r2 = d.run("继续，把总结写成 Markdown 文档", resume=d.last_session_id)
    print("resumed sessionId:", r2.session_id)

    # 3. 或直接续最近的会话（-c）
    r3 = d.run("再压缩到 3 条要点", continue_latest=True)
    print("continued:", r3.returncode == 0)

    # 4. 命名会话，之后按名字恢复（不记 session id）
    r4 = d.run("审查这个 PR", name="pr-review")
    print("named sessionId:", r4.session_id)
    r5 = d.run("继续审查，重点看并发安全", resume="pr-review")
    print("resumed by name:", r5.session_id)
