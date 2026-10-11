from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import pytest

from llm.cli.selector import save_config
from llm.core.interface import LLMProvider
from llm.core.types import ProviderType
from llm.providers.astraflow import AstraflowCNProvider, AstraflowProvider
from llm.providers.atlas import AtlasProvider
from llm.providers.ollama import OllamaProvider
from llm.providers.resolver import get_provider

pytestmark = pytest.mark.unit


@dataclass(frozen=True)
class ProviderCase:
    provider_type: ProviderType
    constructor: Callable[..., LLMProvider]
    model_env: str
    builtin_model: str


PROVIDERS = (
    ProviderCase(ProviderType.OLLAMA, OllamaProvider, "OLLAMA_MODEL", "llama3.2"),
    ProviderCase(ProviderType.ATLAS, AtlasProvider, "ATLAS_MODEL", "deepseek-ai/deepseek-v4-pro"),
    ProviderCase(ProviderType.ASTRAFLOW, AstraflowProvider, "ASTRAFLOW_MODEL", "gpt-4o-mini"),
    ProviderCase(ProviderType.ASTRAFLOW_CN, AstraflowCNProvider, "ASTRAFLOW_CN_MODEL", "gpt-4o-mini"),
)
PROVIDER_IDS = tuple(case.provider_type.value for case in PROVIDERS)
BLANK_MODELS = (" \t ", ' " \t " ')


@pytest.fixture(autouse=True)
def isolated_model_config(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    for name in (
        "LLM_PROVIDER", "LLM_MODEL", "OLLAMA_MODEL", "ATLAS_MODEL",
        "ASTRAFLOW_MODEL", "ASTRAFLOW_CN_MODEL", "OLLAMA_BASE_URL",
        "ATLAS_BASE_URL", "ASTRAFLOW_BASE_URL", "ASTRAFLOW_CN_BASE_URL",
    ):
        # Record even absent variables: save_config(persist=True) writes them directly.
        monkeypatch.setenv(name, "")
        monkeypatch.delenv(name)
    for name in ("ATLAS_API_KEY", "ASTRAFLOW_API_KEY", "ASTRAFLOW_CN_API_KEY"):
        monkeypatch.setenv(name, "test-key")


def set_provider_model(
    monkeypatch: pytest.MonkeyPatch, case: ProviderCase, value: str
) -> None:
    monkeypatch.setenv(case.model_env, value)
    if case.provider_type == ProviderType.ASTRAFLOW_CN:
        monkeypatch.setenv("ASTRAFLOW_MODEL", value)


@pytest.mark.parametrize("case", PROVIDERS, ids=PROVIDER_IDS)
@pytest.mark.parametrize("blank_model", BLANK_MODELS, ids=("whitespace", "quoted-whitespace"))
@pytest.mark.parametrize("source", ("environment", "saved"))
def test_blank_provider_model_falls_back_to_selected_model(
    monkeypatch: pytest.MonkeyPatch,
    case: ProviderCase,
    blank_model: str,
    source: Literal["environment", "saved"],
) -> None:
    save_config(case.provider_type.value, "Selected/MixedCase-model", persist=source == "environment")
    set_provider_model(monkeypatch, case, blank_model)

    assert get_provider().get_default_model() == "Selected/MixedCase-model"


@pytest.mark.parametrize("case", PROVIDERS, ids=PROVIDER_IDS)
@pytest.mark.parametrize("blank_model", BLANK_MODELS, ids=("whitespace", "quoted-whitespace"))
def test_blank_provider_model_without_selection_retains_builtin_default(
    monkeypatch: pytest.MonkeyPatch, case: ProviderCase, blank_model: str
) -> None:
    set_provider_model(monkeypatch, case, blank_model)

    assert get_provider(case.provider_type).get_default_model() == case.builtin_model
    assert case.constructor().get_default_model() == case.builtin_model


@pytest.mark.parametrize("case", PROVIDERS, ids=PROVIDER_IDS)
@pytest.mark.parametrize("model", ('  "Provider/MixedCase-model"  ', "  'Provider/MixedCase-model'  "))
def test_quoted_provider_model_is_normalized_without_changing_case(
    monkeypatch: pytest.MonkeyPatch, case: ProviderCase, model: str
) -> None:
    monkeypatch.setenv("LLM_MODEL", "selected-model")
    monkeypatch.setenv(case.model_env, model)

    assert get_provider(case.provider_type).get_default_model() == "Provider/MixedCase-model"
    assert case.constructor().get_default_model() == "Provider/MixedCase-model"


@pytest.mark.parametrize("case", PROVIDERS, ids=PROVIDER_IDS)
def test_explicit_default_model_keeps_precedence_and_original_value(
    monkeypatch: pytest.MonkeyPatch, case: ProviderCase
) -> None:
    save_config(case.provider_type.value, "selected-model", persist=True)
    set_provider_model(monkeypatch, case, ' "Provider/MixedCase-model" ')
    explicit_model = '  "Explicit/MixedCase-model"  '

    assert get_provider(default_model=explicit_model).get_default_model() == explicit_model
    assert case.constructor(default_model=explicit_model).get_default_model() == explicit_model


@pytest.mark.parametrize("blank_model", BLANK_MODELS, ids=("whitespace", "quoted-whitespace"))
def test_cn_blank_specific_model_uses_normalized_shared_model(
    monkeypatch: pytest.MonkeyPatch, blank_model: str
) -> None:
    monkeypatch.setenv("ASTRAFLOW_CN_MODEL", blank_model)
    monkeypatch.setenv("ASTRAFLOW_MODEL", ' "Shared/MixedCase-model" ')
    monkeypatch.setenv("LLM_MODEL", "selected-model")

    assert get_provider(ProviderType.ASTRAFLOW_CN).get_default_model() == "Shared/MixedCase-model"
    assert AstraflowCNProvider().get_default_model() == "Shared/MixedCase-model"


@pytest.mark.parametrize("default_model", (None, ""))
def test_unset_constructor_model_uses_selected_model(
    monkeypatch: pytest.MonkeyPatch, default_model: str | None
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_MODEL", "Selected-Case-Model")
    provider = get_provider("openai", api_key="test-key", default_model=default_model)
    assert provider.get_default_model() == "Selected-Case-Model"
