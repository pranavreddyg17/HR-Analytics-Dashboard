from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    root_dir: Path = Path(__file__).resolve().parents[1]
    api_prefix: str = "/api/v1"
    app_name: str = "LaidbackHR.AI API"
    allowed_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000",
        ).split(",")
        if origin.strip()
    )
    @property
    def data_path(self) -> Path:
        return self.root_dir / "data" / "attrition.csv"

    @property
    def model_path(self) -> Path:
        return self.root_dir / "model" / "attrition_pipeline.joblib"

    @property
    def metadata_path(self) -> Path:
        return self.root_dir / "model" / "model_metadata.json"

settings = Settings()
