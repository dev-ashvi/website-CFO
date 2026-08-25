from __future__ import annotations

from mapping_eval_cases import all_eval_cases
from wyz_analytics.mapping.evaluate import evaluate_mapping_cases
from wyz_analytics.mapping.fake_model import FakeSchemaMappingModel


def test_mapping_eval_suite_prefers_review_over_false_auto_accept():
    metrics = evaluate_mapping_cases(all_eval_cases(), mapping_model=FakeSchemaMappingModel())
    assert metrics.n_cases >= 6
    assert metrics.role_accuracy >= 0.8
    assert metrics.incorrect_auto_accept_rate == 0.0
    assert metrics.incorrect_auto_accepts == []
    assert metrics.required_mapping_accuracy >= 0.7
    assert metrics.review_required_rate > 0
