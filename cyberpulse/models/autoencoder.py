"""Optional autoencoder-style anomaly scorer for a demo talking point.

The main prototype uses Isolation Forest. This module keeps an optional,
lightweight reconstruction-error path that can run with scikit-learn only.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT.parent))

from cyberpulse.features.session_features import SESSION_FEATURE_COLUMNS, feature_matrix


DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_FEATURES = DATA_DIR / "session_features.csv"
DEFAULT_OUTPUT = DATA_DIR / "autoencoder_scores.csv"


def fit_autoencoder_scores(session_features: pd.DataFrame, random_state: int = 42) -> pd.DataFrame:
    normal_sessions = session_features
    if "session_is_attack_scenario" in session_features.columns:
        normal_sessions = session_features[~session_features["session_is_attack_scenario"].astype(bool)]

    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()
    x_train = scaler.fit_transform(imputer.fit_transform(feature_matrix(normal_sessions)))
    x_all = scaler.transform(imputer.transform(feature_matrix(session_features)))

    bottleneck = max(4, min(8, len(SESSION_FEATURE_COLUMNS) // 2))
    model = MLPRegressor(
        hidden_layer_sizes=(bottleneck,),
        activation="relu",
        solver="adam",
        random_state=random_state,
        max_iter=250,
        early_stopping=True,
    )
    model.fit(x_train, x_train)

    reconstruction = model.predict(x_all)
    errors = np.mean((x_all - reconstruction) ** 2, axis=1)
    low = float(np.percentile(errors, 1))
    high = float(np.percentile(errors, 99.5))
    risk = np.clip((errors - low) / max(high - low, 1e-9) * 100.0, 0.0, 100.0)

    scored = session_features.copy()
    scored["autoencoder_reconstruction_error"] = errors
    scored["autoencoder_risk_score"] = risk.round(2)
    return scored.sort_values("autoencoder_risk_score", ascending=False).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train optional CyberPulse autoencoder scorer.")
    parser.add_argument("--features", type=Path, default=DEFAULT_FEATURES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    session_features = pd.read_csv(args.features)
    scored = fit_autoencoder_scores(session_features)
    scored.to_csv(args.output, index=False)
    print(f"Wrote optional autoencoder scores to {args.output}")


if __name__ == "__main__":
    main()
