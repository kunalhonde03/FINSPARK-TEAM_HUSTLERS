"""Optional SHAP-style feature attribution helper for CyberPulse.

If SHAP is installed, this module can call it. Otherwise it returns a small
z-score attribution fallback so the dashboard still has useful feature context.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from cyberpulse.features.session_features import SESSION_FEATURE_COLUMNS


def fallback_feature_attribution(
    session: pd.Series | dict[str, Any],
    reference_features: pd.DataFrame,
    limit: int = 6,
) -> list[dict[str, float | str]]:
    row = pd.Series(session)
    reference = reference_features[SESSION_FEATURE_COLUMNS].replace([np.inf, -np.inf], np.nan)
    medians = reference.median(numeric_only=True)
    spread = reference.mad(numeric_only=True) if hasattr(reference, "mad") else (reference - medians).abs().mean()
    spread = spread.replace(0, 1.0).fillna(1.0)

    contributions = []
    for column in SESSION_FEATURE_COLUMNS:
        value = float(row.get(column, 0) or 0)
        magnitude = abs(value - float(medians.get(column, 0))) / float(spread.get(column, 1.0))
        contributions.append(
            {
                "feature": column,
                "attribution": round(float(magnitude), 3),
                "value": round(value, 3),
            }
        )

    return sorted(contributions, key=lambda item: item["attribution"], reverse=True)[:limit]


def shap_feature_attribution(
    model: Any,
    transformed_reference: np.ndarray,
    transformed_row: np.ndarray,
    feature_names: list[str] | None = None,
    limit: int = 6,
) -> list[dict[str, float | str]]:
    """Try SHAP TreeExplainer; raise ImportError if shap is unavailable."""

    import shap  # type: ignore

    explainer = shap.TreeExplainer(model, transformed_reference)
    shap_values = explainer.shap_values(transformed_row)
    values = np.asarray(shap_values).reshape(-1)
    names = feature_names or SESSION_FEATURE_COLUMNS
    ranked = sorted(zip(names, values), key=lambda item: abs(item[1]), reverse=True)[:limit]
    return [
        {"feature": name, "attribution": round(float(value), 3), "value": round(float(value), 3)}
        for name, value in ranked
    ]
