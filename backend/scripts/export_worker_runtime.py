from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.services import ModelRuntime


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
OUTPUT_PATH = PROJECT_DIR / "lib" / "server" / "runtime-data.json"


def main() -> None:
    runtime = ModelRuntime.load()
    preprocessor = runtime.pipeline.named_steps["preprocessor"]
    classifier = runtime.pipeline.named_steps["classifier"]
    numeric_pipeline = preprocessor.named_transformers_["numeric"]
    categorical_pipeline = preprocessor.named_transformers_["categorical"]
    one_hot = categorical_pipeline.named_steps["onehot"]

    data = {
        "sourceSha256": hashlib.sha256(runtime.data.to_csv(index=False).encode("utf-8")).hexdigest(),
        "metadata": runtime.metadata,
        "schema": {
            "numericRanges": runtime.metadata["numeric_ranges"],
            "categoricalOptions": runtime.metadata["categorical_options"],
            "excludedFromModel": runtime.metadata["dataset"]["excluded_from_model"],
            "threshold": runtime.threshold,
        },
        "dashboard": runtime.dashboard(),
        "employees": runtime.employees(),
        "dataDictionary": runtime.data_dictionary(),
        "predictionModel": {
            "numericColumns": runtime.metadata["numeric_columns"],
            "categoricalColumns": runtime.metadata["categorical_columns"],
            "coefficients": classifier.coef_[0].tolist(),
            "intercept": float(classifier.intercept_[0]),
            "numericMeans": numeric_pipeline.named_steps["scaler"].mean_.tolist(),
            "numericScales": numeric_pipeline.named_steps["scaler"].scale_.tolist(),
            "categoricalValues": [values.tolist() for values in one_hot.categories_],
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"Exported {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
