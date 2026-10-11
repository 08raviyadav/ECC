"""Tests for scripts.classifier._parse_classification."""

import pytest

from scripts import classifier
from scripts.classifier import _parse_classification


class TestParseClassification:
    def test_plain_json(self):
        assert _parse_classification('{"a": [0, 2]}') == {"a": [0, 2]}

    def test_fenced_json(self):
        assert _parse_classification('```json\n{"a": [1]}\n```') == {"a": [1]}

    def test_dict_without_list_values_is_empty(self):
        assert _parse_classification('{"a": "x"}') == {}

    def test_garbage_raises(self):
        with pytest.raises(RuntimeError):
            _parse_classification("sorry, I cannot classify these")

    def test_non_dict_json_raises(self):
        with pytest.raises(RuntimeError):
            _parse_classification("[1, 2, 3]")

    def test_non_integer_indices_raise(self):
        with pytest.raises(RuntimeError):
            _parse_classification('{"a": ["x"]}')

    def test_is_runtime_error(self):
        assert issubclass(classifier.ClassifierParseError, RuntimeError)
