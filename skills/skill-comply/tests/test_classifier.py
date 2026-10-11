"""Tests for scripts.classifier._parse_classification."""

import subprocess
from unittest.mock import patch

import pytest
from scripts import classifier
from scripts.classifier import _parse_classification
from scripts.grader import grade
from scripts.parser import ComplianceSpec, Detector, ObservationEvent, Step


class TestParseClassification:
    def test_plain_json(self) -> None:
        assert _parse_classification('{"a": [0, 2]}') == {"a": [0, 2]}

    def test_fenced_json(self) -> None:
        assert _parse_classification('```json\n{"a": [1]}\n```') == {"a": [1]}

    def test_dict_without_list_values_is_empty(self) -> None:
        assert _parse_classification('{"a": "x"}') == {}

    def test_empty_object_is_valid(self) -> None:
        assert _parse_classification("{}") == {}

    def test_garbage_raises(self) -> None:
        with pytest.raises(classifier.ClassifierParseError, match="failed to parse"):
            _parse_classification("sorry, I cannot classify these")

    def test_non_dict_json_raises(self) -> None:
        with pytest.raises(classifier.ClassifierParseError, match="non-dict"):
            _parse_classification("[1, 2, 3]")

    def test_non_integer_indices_raise(self) -> None:
        with pytest.raises(classifier.ClassifierParseError, match="failed to parse"):
            _parse_classification('{"a": ["x"]}')

    def test_is_runtime_error(self) -> None:
        assert issubclass(classifier.ClassifierParseError, RuntimeError)


@pytest.mark.parametrize("response", ["not JSON", "[]", '{"a": ["x"]}'])
def test_grader_propagates_classifier_parse_failure(response: str) -> None:
    """An invalid successful subprocess response cannot become a zero score."""
    spec = ComplianceSpec(
        id="fixture", name="Fixture", source_rule="fixture", version="1",
        steps=(Step("a", "Read a file", True, Detector("Read a file")),),
        threshold_promote_to_hook=0.6,
    )
    trace = [ObservationEvent("T0000", "tool_complete", "Read", "fixture", "", "")]
    result = subprocess.CompletedProcess(["claude"], 0, stdout=response, stderr="")
    with patch("scripts.classifier.subprocess.run", return_value=result) as execute:
        with pytest.raises(classifier.ClassifierParseError):
            grade(spec, trace)
    execute.assert_called_once()
