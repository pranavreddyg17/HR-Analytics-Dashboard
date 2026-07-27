from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "attrition.csv"
MODEL_PATH = ROOT / "model" / "attrition_pipeline.joblib"
METADATA_PATH = ROOT / "model" / "model_metadata.json"

TARGET = "Attrition"
RANDOM_STATE = 42
EXCLUDED_FROM_MODEL = ["Age", "MaritalStatus"]


def build_pipeline(numeric_columns: list[str], categorical_columns: list[str]) -> Pipeline:
    numeric = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            ),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", numeric, numeric_columns),
            ("categorical", categorical, categorical_columns),
        ],
        verbose_feature_names_out=True,
    )
    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
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


def pick_threshold(y_true: pd.Series, probabilities: np.ndarray) -> float:
    candidates = np.linspace(0.05, 0.60, 221)
    scores = [f1_score(y_true, probabilities >= t, zero_division=0) for t in candidates]
    return float(candidates[int(np.argmax(scores))])


def original_feature_name(encoded_name: str, categorical_columns: list[str]) -> str:
    raw = encoded_name.split("__", 1)[-1]
    for column in categorical_columns:
        if raw == column or raw.startswith(f"{column}_"):
            return column
    return raw


def main() -> None:
    df = pd.read_csv(DATA_PATH)
    if TARGET not in df.columns:
        raise ValueError(f"Missing required target column: {TARGET}")

    X = df.drop(columns=[TARGET, *EXCLUDED_FROM_MODEL])
    y = (df[TARGET].astype(str).str.lower() == "yes").astype(int)
    categorical_columns = X.select_dtypes(include=["object", "category"]).columns.tolist()
    numeric_columns = [column for column in X.columns if column not in categorical_columns]

    pipeline = build_pipeline(numeric_columns, categorical_columns)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    oof_probabilities = cross_val_predict(
        pipeline,
        X,
        y,
        cv=cv,
        method="predict_proba",
        n_jobs=-1,
    )[:, 1]
    threshold = pick_threshold(y, oof_probabilities)
    oof_predictions = (oof_probabilities >= threshold).astype(int)

    pipeline.fit(X, y)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)

    preprocessor = pipeline.named_steps["preprocessor"]
    classifier = pipeline.named_steps["classifier"]
    transformed_names = preprocessor.get_feature_names_out().tolist()
    coefficients = classifier.coef_[0]

    grouped_importance: dict[str, float] = {}
    grouped_positive: dict[str, float] = {}
    for encoded_name, coefficient in zip(transformed_names, coefficients, strict=True):
        original = original_feature_name(encoded_name, categorical_columns)
        grouped_importance[original] = grouped_importance.get(original, 0.0) + abs(float(coefficient))
        grouped_positive[original] = grouped_positive.get(original, 0.0) + max(float(coefficient), 0.0)

    importance_total = sum(grouped_importance.values()) or 1.0
    positive_total = sum(grouped_positive.values()) or 1.0
    feature_importance = [
        {"feature": feature, "importance": value / importance_total}
        for feature, value in sorted(grouped_importance.items(), key=lambda item: item[1], reverse=True)
    ]
    positive_drivers = [
        {"feature": feature, "share": value / positive_total}
        for feature, value in sorted(grouped_positive.items(), key=lambda item: item[1], reverse=True)
        if value > 0
    ]

    metrics = {
        "roc_auc": roc_auc_score(y, oof_probabilities),
        "average_precision": average_precision_score(y, oof_probabilities),
        "precision": precision_score(y, oof_predictions, zero_division=0),
        "recall": recall_score(y, oof_predictions, zero_division=0),
        "f1": f1_score(y, oof_predictions, zero_division=0),
        "accuracy": accuracy_score(y, oof_predictions),
        "brier_score": brier_score_loss(y, oof_probabilities),
        "confusion_matrix": confusion_matrix(y, oof_predictions).tolist(),
    }

    metadata = {
        "model_name": "Regularized Logistic Regression",
        "model_version": "1.0.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "evaluation": "5-fold stratified out-of-fold evaluation",
        "threshold": threshold,
        "metrics": metrics,
        "dataset": {
            "rows": int(len(df)),
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
            "The uploaded dataset is historical and contains no employee names, job titles, managers, locations, dates, hiring events, leave records, training records, or promotion records.",
            "Risk scores are model estimates, not facts or employment decisions. Human review is required.",
            "The model is intended for demonstration and analytics validation, not automated HR action.",
        ],
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps({"model": str(MODEL_PATH), "metadata": str(METADATA_PATH), **metrics}, indent=2))


if __name__ == "__main__":
    main()
