from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "attrition.csv"
MODEL_PATH = ROOT / "model" / "attrition_pipeline.joblib"
METADATA_PATH = ROOT / "model" / "model_metadata.json"

TARGET = "Attrition"
RANDOM_STATE = 42
EXCLUDED_FROM_MODEL = ["Age", "MaritalStatus"]
MODEL_VERSION = "2.0.0"


def build_preprocessor(
    numeric_columns: list[str],
    categorical_columns: list[str],
    *,
    scale_numeric: bool,
) -> ColumnTransformer:
    numeric_steps: list[tuple[str, object]] = [("imputer", SimpleImputer(strategy="median"))]
    if scale_numeric:
        numeric_steps.append(("scaler", StandardScaler()))
    numeric = Pipeline(steps=numeric_steps)
    categorical = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("numeric", numeric, numeric_columns),
            ("categorical", categorical, categorical_columns),
        ],
        verbose_feature_names_out=True,
    )


def build_logistic_baseline(numeric_columns: list[str], categorical_columns: list[str]) -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(numeric_columns, categorical_columns, scale_numeric=True)),
            (
                "classifier",
                LogisticRegression(
                    C=0.30,
                    max_iter=3000,
                    solver="lbfgs",
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def build_gradient_boosting(numeric_columns: list[str], categorical_columns: list[str]) -> Pipeline:
    return Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(numeric_columns, categorical_columns, scale_numeric=False)),
            (
                "classifier",
                GradientBoostingClassifier(
                    n_estimators=150,
                    learning_rate=0.025,
                    max_depth=2,
                    min_samples_leaf=12,
                    subsample=0.8,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def pick_threshold(y_true: pd.Series, probabilities: np.ndarray) -> float:
    candidates = np.linspace(0.05, 0.60, 551)
    scores = [f1_score(y_true, probabilities >= threshold, zero_division=0) for threshold in candidates]
    return float(candidates[int(np.argmax(scores))])


def expected_calibration_error(y_true: pd.Series, probabilities: np.ndarray, bins: int = 10) -> float:
    edges = np.quantile(probabilities, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = 0.0, 1.0
    total = len(y_true)
    error = 0.0
    for lower, upper in zip(edges[:-1], edges[1:], strict=True):
        selected = (probabilities >= lower) & (probabilities <= upper if upper == 1 else probabilities < upper)
        if not selected.any():
            continue
        observed = float(y_true.iloc[np.flatnonzero(selected)].mean())
        predicted = float(probabilities[selected].mean())
        error += float(selected.sum()) / total * abs(observed - predicted)
    return error


def metric_set(y_true: pd.Series, probabilities: np.ndarray, threshold: float) -> dict[str, object]:
    predictions = probabilities >= threshold
    return {
        "roc_auc": roc_auc_score(y_true, probabilities),
        "average_precision": average_precision_score(y_true, probabilities),
        "precision": precision_score(y_true, predictions, zero_division=0),
        "recall": recall_score(y_true, predictions, zero_division=0),
        "f1": f1_score(y_true, predictions, zero_division=0),
        "accuracy": accuracy_score(y_true, predictions),
        "brier_score": brier_score_loss(y_true, probabilities),
        "log_loss": log_loss(y_true, probabilities),
        "expected_calibration_error": expected_calibration_error(y_true, probabilities),
        "confusion_matrix": confusion_matrix(y_true, predictions).tolist(),
    }


def out_of_fold_probabilities(
    estimator: Pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    cv: StratifiedKFold,
) -> tuple[np.ndarray, list[dict[str, float]]]:
    probabilities = np.zeros(len(X), dtype=float)
    folds: list[dict[str, float]] = []
    for train_index, test_index in cv.split(X, y):
        model = clone(estimator).fit(X.iloc[train_index], y.iloc[train_index])
        fold_probability = model.predict_proba(X.iloc[test_index])[:, 1]
        probabilities[test_index] = fold_probability
        folds.append(
            {
                "roc_auc": roc_auc_score(y.iloc[test_index], fold_probability),
                "average_precision": average_precision_score(y.iloc[test_index], fold_probability),
                "brier_score": brier_score_loss(y.iloc[test_index], fold_probability),
                "log_loss": log_loss(y.iloc[test_index], fold_probability),
            }
        )
    return probabilities, folds


def bootstrap_confidence_intervals(
    y_true: pd.Series,
    probabilities: np.ndarray,
    repeats: int = 1000,
) -> dict[str, list[float]]:
    rng = np.random.default_rng(RANDOM_STATE)
    positives = np.flatnonzero(y_true.to_numpy() == 1)
    negatives = np.flatnonzero(y_true.to_numpy() == 0)
    values: dict[str, list[float]] = {"roc_auc": [], "average_precision": [], "brier_score": []}
    scorers: dict[str, Callable[[np.ndarray, np.ndarray], float]] = {
        "roc_auc": roc_auc_score,
        "average_precision": average_precision_score,
        "brier_score": brier_score_loss,
    }
    y_array = y_true.to_numpy()
    for _ in range(repeats):
        sample = np.concatenate(
            [
                rng.choice(positives, len(positives), replace=True),
                rng.choice(negatives, len(negatives), replace=True),
            ]
        )
        rng.shuffle(sample)
        for name, scorer in scorers.items():
            values[name].append(float(scorer(y_array[sample], probabilities[sample])))
    return {
        name: [float(np.quantile(samples, 0.025)), float(np.quantile(samples, 0.975))]
        for name, samples in values.items()
    }


def repeated_stability(estimator: Pipeline, X: pd.DataFrame, y: pd.Series) -> dict[str, dict[str, float]]:
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=RANDOM_STATE)
    metrics: dict[str, list[float]] = {
        "roc_auc": [],
        "average_precision": [],
        "brier_score": [],
    }
    for train_index, test_index in cv.split(X, y):
        model = clone(estimator).fit(X.iloc[train_index], y.iloc[train_index])
        probability = model.predict_proba(X.iloc[test_index])[:, 1]
        metrics["roc_auc"].append(float(roc_auc_score(y.iloc[test_index], probability)))
        metrics["average_precision"].append(float(average_precision_score(y.iloc[test_index], probability)))
        metrics["brier_score"].append(float(brier_score_loss(y.iloc[test_index], probability)))
    return {
        name: {
            "mean": float(np.mean(values)),
            "standard_deviation": float(np.std(values)),
            "p2_5": float(np.quantile(values, 0.025)),
            "p97_5": float(np.quantile(values, 0.975)),
        }
        for name, values in metrics.items()
    }


def cross_validated_permutation_importance(
    estimator: Pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    cv: StratifiedKFold,
) -> list[dict[str, float | str]]:
    values = {column: [] for column in X.columns}
    for fold, (train_index, test_index) in enumerate(cv.split(X, y)):
        model = clone(estimator).fit(X.iloc[train_index], y.iloc[train_index])
        importance = permutation_importance(
            model,
            X.iloc[test_index],
            y.iloc[test_index],
            scoring="average_precision",
            n_repeats=10,
            random_state=RANDOM_STATE + fold,
        )
        for column, samples in zip(X.columns, importance.importances, strict=True):
            values[column].extend(float(value) for value in samples)
    positive_means = {column: max(float(np.mean(samples)), 0.0) for column, samples in values.items()}
    total = sum(positive_means.values()) or 1.0
    return sorted(
        [
            {
                "feature": column,
                "importance": positive_means[column] / total,
                "mean_ap_decrease": float(np.mean(samples)),
                "standard_deviation": float(np.std(samples)),
            }
            for column, samples in values.items()
        ],
        key=lambda item: float(item["importance"]),
        reverse=True,
    )


def main() -> None:
    data = pd.read_csv(DATA_PATH)
    if TARGET not in data.columns:
        raise ValueError(f"Missing required target column: {TARGET}")

    X = data.drop(columns=[TARGET, *EXCLUDED_FROM_MODEL])
    y = (data[TARGET].astype(str).str.lower() == "yes").astype(int)
    categorical_columns = X.select_dtypes(include=["object", "category"]).columns.tolist()
    numeric_columns = [column for column in X.columns if column not in categorical_columns]
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    candidates = {
        "Regularized Logistic Regression": build_logistic_baseline(numeric_columns, categorical_columns),
        "Compact Gradient Boosting": build_gradient_boosting(numeric_columns, categorical_columns),
    }
    candidate_results: dict[str, dict[str, object]] = {}
    candidate_probabilities: dict[str, np.ndarray] = {}
    for name, candidate in candidates.items():
        probabilities, folds = out_of_fold_probabilities(candidate, X, y, cv)
        threshold = pick_threshold(y, probabilities)
        candidate_probabilities[name] = probabilities
        candidate_results[name] = {
            "threshold": threshold,
            "metrics": metric_set(y, probabilities, threshold),
            "folds": folds,
        }

    baseline = candidate_results["Regularized Logistic Regression"]["metrics"]
    challenger = candidate_results["Compact Gradient Boosting"]["metrics"]
    assert isinstance(baseline, dict) and isinstance(challenger, dict)
    challenger_passes = (
        float(challenger["roc_auc"]) >= float(baseline["roc_auc"]) + 0.01
        and float(challenger["average_precision"]) >= float(baseline["average_precision"])
        and float(challenger["brier_score"]) <= float(baseline["brier_score"]) + 0.002
    )
    selected_name = "Compact Gradient Boosting" if challenger_passes else "Regularized Logistic Regression"
    pipeline = candidates[selected_name]
    probabilities = candidate_probabilities[selected_name]
    threshold = float(candidate_results[selected_name]["threshold"])
    metrics = candidate_results[selected_name]["metrics"]
    pipeline.fit(X, y)

    feature_importance = cross_validated_permutation_importance(pipeline, X, y, cv)
    positive_drivers = [
        {"feature": item["feature"], "share": item["importance"]}
        for item in feature_importance
        if float(item["importance"]) > 0
    ]
    reference_profile = {
        **{column: float(X[column].median()) for column in numeric_columns},
        **{column: str(X[column].mode(dropna=True).iloc[0]) for column in categorical_columns},
    }

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    metadata = {
        "model_name": selected_name,
        "model_version": MODEL_VERSION,
        "model_family": "gradient_boosting" if selected_name == "Compact Gradient Boosting" else "logistic_regression",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "evaluation": "Five-fold stratified out-of-fold evaluation with a 10x repeated stability check",
        "threshold": threshold,
        "threshold_policy": "Maximise out-of-fold F1 for a human-review queue; recalibrate to local review capacity before operational use.",
        "metrics": metrics,
        "confidence_intervals_95": bootstrap_confidence_intervals(y, probabilities),
        "stability": repeated_stability(pipeline, X, y),
        "candidate_comparison": candidate_results,
        "selection_policy": {
            "selected": selected_name,
            "challenger_gate": "ROC-AUC improvement >= 0.01, average precision not lower, and Brier score no more than 0.002 worse than logistic baseline.",
            "passed": challenger_passes,
        },
        "explanation_method": "Reference-profile sensitivity",
        "reference_profile": reference_profile,
        "dataset": {
            "rows": int(len(data)),
            "features": int(X.shape[1]),
            "excluded_from_model": EXCLUDED_FROM_MODEL,
            "positive_rows": int(y.sum()),
            "negative_rows": int((1 - y).sum()),
            "observed_attrition_rate": float(y.mean()),
            "source_file": DATA_PATH.name,
        },
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "feature_importance": feature_importance,
        "positive_drivers": positive_drivers,
        "categorical_options": {
            column: sorted(X[column].dropna().astype(str).unique().tolist())
            for column in categorical_columns
        },
        "numeric_ranges": {
            column: {
                "min": float(X[column].min()),
                "max": float(X[column].max()),
                "median": float(X[column].median()),
            }
            for column in numeric_columns
        },
        "notes": [
            "Age and MaritalStatus are excluded from model training to reduce employment fairness and discrimination risk.",
            "The dataset is small and historical; confidence intervals and repeated folds show material uncertainty.",
            "Local explanations compare one field at a time with a reference profile and do not establish cause.",
            "Risk scores support qualified human review only and must not automate an employment decision.",
            "Validate calibration, fairness, drift, and review capacity on current company data before operational use.",
        ],
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "model": str(MODEL_PATH),
                "metadata": str(METADATA_PATH),
                "selected": selected_name,
                **metrics,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
