"""Input-mode regressions for the standalone agent output evaluator."""

import argparse
import importlib.util
import io
import re
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "skills/agent-self-evaluation/scripts/evaluate.py"
SPEC = importlib.util.spec_from_file_location("agent_self_evaluation", SCRIPT)
evaluator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = evaluator
SPEC.loader.exec_module(evaluator)


def args(**overrides):
    return argparse.Namespace(**{"interactive": False, "task": None, "output": None, **overrides})


def test_output_file_uses_piped_task(tmp_path, monkeypatch):
    output = tmp_path / "response.txt"
    output.write_text("All tests passed.", encoding="utf-8")
    monkeypatch.setattr(sys, "stdin", io.StringIO("Add retry logic"))

    assert evaluator._read_input(args(output=str(output))) == ("Add retry logic", "All tests passed.")


def test_explicit_task_takes_precedence_over_pipe(tmp_path, monkeypatch):
    output = tmp_path / "response.txt"
    output.write_text("Answer", encoding="utf-8")
    stream = io.StringIO("Ignored pipe")
    monkeypatch.setattr(sys, "stdin", stream)

    assert evaluator._read_input(args(task="Explicit task", output=str(output))) == ("Explicit task", "Answer")
    assert stream.tell() == 0


def test_output_file_without_task_does_not_read_terminal(tmp_path, monkeypatch):
    output = tmp_path / "response.txt"
    output.write_text("Answer", encoding="utf-8")
    monkeypatch.setattr(sys, "stdin", SimpleNamespace(isatty=lambda: True))

    assert evaluator._read_input(args(output=str(output))) == (None, "Answer")


def test_no_output_file_keeps_stdin_as_output(monkeypatch):
    monkeypatch.setattr(sys, "stdin", io.StringIO("Piped answer"))
    assert evaluator._read_input(args(task="Inline task")) == ("Inline task", "Piped answer")


def test_interactive_mode_keeps_prompt_and_stdin(monkeypatch):
    monkeypatch.setattr("builtins.input", lambda _prompt: "  Interactive task  ")
    monkeypatch.setattr(sys, "stdin", io.StringIO("Interactive answer"))
    assert evaluator._read_input(args(interactive=True)) == ("Interactive task", "Interactive answer")


def test_task_can_still_be_read_from_file(tmp_path, monkeypatch):
    task = tmp_path / "task.txt"
    task.write_text("File task", encoding="utf-8")
    monkeypatch.setattr(sys, "stdin", io.StringIO("Piped answer"))
    assert evaluator._read_input(args(task=str(task))) == ("File task", "Piped answer")


def test_missing_output_file_still_fails(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.StringIO("Task"))
    with pytest.raises(SystemExit, match="1"):
        evaluator._read_input(args(output=str(tmp_path / "missing.txt")))
    assert "not found" in capsys.readouterr().err


def test_cli_uses_piped_task_for_conciseness_score(tmp_path):
    output = tmp_path / "response.txt"
    output.write_text("Verified with tests. " * 25, encoding="utf-8")
    result = subprocess.run(
        [sys.executable, "-X", "utf8", str(SCRIPT), "--output", str(output)],
        input="Fix bug",
        capture_output=True,
        encoding="utf-8",
        check=True,
        timeout=10,
    )
    assert re.search(r"Conciseness[^\n]*3/5", result.stdout)
