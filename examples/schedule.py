#!/usr/bin/env python3
"""Python Popen scheduling for dsh-cmd-starter.

Uses `dsh --profile headless --output-format json` so every run returns the
session id, which a later `--resume` / `-c` reuses. No Python SDK needed.
"""

import json
import subprocess
import sys
from typing import Optional


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
        cwd: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> dict:
        args = ["dsh", "--profile", self.profile, "--output-format", "json"]
        for p in append_prompt or []:
            args += ["--append-prompt", p]
        if resume is not None:
            args += ["--resume", resume]
        if continue_latest:
            args += ["--continue"]
        if provider is not None:
            args += ["--provider", provider]
        if model is not None:
            args += ["--model", model]
        if max_tokens is not None:
            args += ["--max-tokens", str(max_tokens)]
        args.append(task)

        proc = subprocess.run(args, capture_output=True, text=True, cwd=cwd, timeout=900)

        if proc.returncode != 0:
            raise RuntimeError(f"dsh exited {proc.returncode}: {proc.stderr.strip()}")

        try:
            result = json.loads(proc.stdout.strip())
        except json.JSONDecodeError:
            result = {"finalResponse": proc.stdout, "finishReason": "unknown"}

        self.last_session_id = result.get("sessionId")
        return result


if __name__ == "__main__":
    d = Dsh()

    # 1. 首次运行：新建会话，拿到 session id
    r1 = d.run("分析 src/ 目录结构并总结", append_prompt=["be concise"])
    print("first sessionId:", r1["sessionId"])
    print("response:", r1["finalResponse"][:200])

    # 2. 续上同一个会话
    r2 = d.run("继续，把总结写成 Markdown 文档", resume=d.last_session_id)
    print("resumed sessionId:", r2["sessionId"])

    # 3. 或直接续最近的会话（-c）
    r3 = d.run("再压缩到 3 条要点", continue_latest=True)
    print("continued:", r3["finishReason"])
