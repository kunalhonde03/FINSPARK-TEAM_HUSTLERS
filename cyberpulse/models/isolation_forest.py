"""Isolation Forest anomaly scoring for CyberPulse sessions."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import RobustScaler

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT.parent))

from cyberpulse.features.session_features import SESSION_FEATURE_COLUMNS, feature_matrix


DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_FEATURES = DATA_DIR / "session_features.csv"
DEFAULT_SCORED = DATA_DIR / "scored_sessions.csv"
DEFAULT_MODEL = DATA_DIR / "isolation_forest.joblib"


@dataclass
class IsolationForestBundle:
    imputer: SimpleImputer
    scaler: RobustScaler
    model: IsolationForest
    feature_columns: list[str]
    score_low: float
    score_high: float


def _clean_feature_frame(session_features: pd.DataFrame) -> pd.DataFrame:
    missing = [column for column in SESSION_FEATURE_COLUMNS if column not in session_features.columns]
    if missing:
        raise ValueError(f"Missing required feature columns: {missing}")
    features = feature_matrix(session_features)
    return features.replace([np.inf, -np.inf], np.nan)


def _normalize_risk(raw_scores: np.ndarray, score_low: float, score_high: float) -> np.ndarray:
    denominator = max(score_high - score_low, 1e-9)
    risk = (raw_scores - score_low) / denominator * 100.0
    return np.clip(risk, 0.0, 100.0)


def fit_isolation_forest(
    session_features: pd.DataFrame,
    contamination: float = 0.05,
    random_state: int = 42,
) -> tuple[IsolationForestBundle, pd.DataFrame]:
    """Fit an unsupervised Isolation Forest and return scored sessions."""

    x = _clean_feature_frame(session_features)
    imputer = SimpleImputer(strategy="median")
    scaler = RobustScaler()
    x_imputed = imputer.fit_transform(x)
    x_scaled = scaler.fit_transform(x_imputed)

    model = IsolationForest(
        n_estimators=350,
        contamination=contamination,
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(x_scaled)

    raw_scores = -model.score_samples(x_scaled)
    score_low = float(np.percentile(raw_scores, 1))
    score_high = float(np.percentile(raw_scores, 99.5))
    bundle = IsolationForestBundle(
        imputer=imputer,
        scaler=scaler,
        model=model,
        feature_columns=list(SESSION_FEATURE_COLUMNS),
        score_low=score_low,
        score_high=score_high,
    )
    return bundle, score_sessions(session_features, bundle)


def score_sessions(session_features: pd.DataFrame, bundle: IsolationForestBundle) -> pd.DataFrame:
    x = session_features[bundle.feature_columns].replace([np.inf, -np.inf], np.nan)
    x_scaled = bundle.scaler.transform(bundle.imputer.transform(x))
    raw_scores = -bundle.model.score_samples(x_scaled)
    predictions = bundle.model.predict(x_scaled)

    scored = session_features.copy()
    scored["anomaly_score"] = raw_scores
    scored["risk_score"] = _normalize_risk(raw_scores, bundle.score_low, bundle.score_high).round(2)
    scored["is_model_anomaly"] = predictions == -1
    return scored.sort_values("risk_score", ascending=False).reset_index(drop=True)


def score_single_session(features: dict[str, float | int], bundle: IsolationForestBundle) -> dict[str, float | bool]:
    row = {column: features.get(column, 0) for column in bundle.feature_columns}
    frame = pd.DataFrame([row])
    scored = score_sessions(frame, bundle).iloc[0]
    return {
        "anomaly_score": float(scored["anomaly_score"]),
        "risk_score": float(scored["risk_score"]),
        "is_model_anomaly": bool(scored["is_model_anomaly"]),
    }


def validation_summary(scored: pd.DataFrame, top_percent: float = 5.0) -> dict[str, float]:
    if "session_is_attack_scenario" not in scored.columns:
        return {}

    threshold = np.percentile(scored["risk_score"], 100 - top_percent)
    top_risk = scored["risk_score"] >= threshold
    attacks = scored["session_is_attack_scenario"].astype(bool)
    attack_count = int(attacks.sum())
    attack_recall = float((top_risk & attacks).sum() / max(attack_count, 1))

    return {
        "total_sessions": float(len(scored)),
        "attack_sessions": float(attack_count),
        "top_percent": float(top_percent),
        "top_percent_threshold": float(threshold),
        "attack_recall_in_top_percent": attack_recall,
        "median_attack_risk": float(scored.loc[attacks, "risk_score"].median()) if attack_count else 0.0,
        "median_normal_risk": float(scored.loc[~attacks, "risk_score"].median()) if (~attacks).any() else 0.0,
    }


def save_bundle(bundle: IsolationForestBundle, path: Path = DEFAULT_MODEL) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "imputer": bundle.imputer,
            "scaler": bundle.scaler,
            "model": bundle.model,
            "feature_columns": bundle.feature_columns,
            "score_low": bundle.score_low,
            "score_high": bundle.score_high,
        },
        path,
    )


def load_bundle(path: Path = DEFAULT_MODEL) -> IsolationForestBundle:
    raw = joblib.load(path)
    if isinstance(raw, IsolationForestBundle):
        return raw
    return IsolationForestBundle(
        imputer=raw["imputer"],
        scaler=raw["scaler"],
        model=raw["model"],
        feature_columns=list(raw["feature_columns"]),
        score_low=float(raw["score_low"]),
        score_high=float(raw["score_high"]),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train CyberPulse Isolation Forest model.")
    parser.add_argument("--features", type=Path, default=DEFAULT_FEATURES)
    parser.add_argument("--output", type=Path, default=DEFAULT_SCORED)
    parser.add_argument("--model-output", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--contamination", type=float, default=0.05)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()

    session_features = pd.read_csv(args.features)
    bundle, scored = fit_isolation_forest(
        session_features=session_features,
        contamination=args.contamination,
        random_state=args.random_state,
    )
    save_bundle(bundle, args.model_output)
    scored.to_csv(args.output, index=False)

    summary = validation_summary(scored)
    print(f"Wrote scored sessions to {args.output}")
    print(f"Wrote fitted model bundle to {args.model_output}")
    if summary:
        print(
            "Validation: "
            f"{summary['attack_recall_in_top_percent']:.1%} of injected attack sessions "
            f"land in the top {summary['top_percent']:.0f}% risk band; "
            f"median attack risk={summary['median_attack_risk']:.1f}, "
            f"median normal risk={summary['median_normal_risk']:.1f}"
        )


if __name__ == "__main__":
    main()
