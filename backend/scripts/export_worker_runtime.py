from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.services import ModelRuntime


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
OUTPUT_PATH = PROJECT_DIR / "lib" / "server" / "runtime-data.json"


def prediction_model(runtime: ModelRuntime) -> dict[str, object]:
    preprocessor = runtime.pipeline.named_steps["preprocessor"]
    classifier = runtime.pipeline.named_steps["classifier"]
    numeric_pipeline = preprocessor.named_transformers_["numeric"]
    categorical_pipeline = preprocessor.named_transformers_["categorical"]
    one_hot = categorical_pipeline.named_steps["onehot"]
    shared = {
        "numericColumns": runtime.metadata["numeric_columns"],
        "categoricalColumns": runtime.metadata["categorical_columns"],
        "numericMedians": numeric_pipeline.named_steps["imputer"].statistics_.tolist(),
        "categoricalValues": [values.tolist() for values in one_hot.categories_],
        "referenceProfile": runtime.metadata["reference_profile"],
    }

    if runtime.metadata["model_family"] == "gradient_boosting":
        transformed = preprocessor.transform(runtime.data[runtime.model_columns].iloc[:1])
        trees = []
        for estimator in classifier.estimators_[:, 0]:
            tree = estimator.tree_
            trees.append(
                {
                    "childrenLeft": tree.children_left.tolist(),
                    "childrenRight": tree.children_right.tolist(),
                    "features": tree.feature.tolist(),
                    "thresholds": tree.threshold.tolist(),
                    "values": tree.value[:, 0, 0].tolist(),
                }
            )
        return {
            **shared,
            "type": "gradient_boosting",
            "learningRate": float(classifier.learning_rate),
            "initialRawScore": float(classifier._raw_predict_init(transformed)[0, 0]),
            "trees": trees,
        }

    return {
        **shared,
        "type": "logistic",
        "coefficients": classifier.coef_[0].tolist(),
        "intercept": float(classifier.intercept_[0]),
        "numericMeans": numeric_pipeline.named_steps["scaler"].mean_.tolist(),
        "numericScales": numeric_pipeline.named_steps["scaler"].scale_.tolist(),
    }


def main() -> None:
    runtime = ModelRuntime.load()

    data = {
        "sourceSha256": hashlib.sha256(runtime.data.to_csv(index=False).encode("utf-8")).hexdigest(),
        "metadata": runtime.metadata,
        "schema": {
            "numericRanges": runtime.metadata["numeric_ranges"],
            "categoricalOptions": runtime.metadata["categorical_options"],
            "excludedFromModel": runtime.metadata["dataset"]["excluded_from_model"],
            "threshold": runtime.threshold,
            "modelName": runtime.metadata["model_name"],
            "modelVersion": runtime.metadata["model_version"],
            "evaluation": runtime.metadata["evaluation"],
            "explanationMethod": runtime.metadata["explanation_method"],
            "thresholdPolicy": runtime.metadata["threshold_policy"],
            "metrics": runtime.metadata["metrics"],
            "confidenceIntervals95": runtime.metadata["confidence_intervals_95"],
        },
        "dashboard": runtime.dashboard(),
        "employees": runtime.employees(),
        "dataDictionary": runtime.data_dictionary(),
        "predictionModel": prediction_model(runtime),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"Exported {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
