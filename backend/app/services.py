from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .config import settings


FEATURE_LABELS = {
    "Department": "Department",
    "DistanceFromHome": "Commute distance",
    "Education": "Education level",
    "EducationField": "Education field",
    "EnvironmentSatisfaction": "Environment satisfaction",
    "JobSatisfaction": "Job satisfaction",
    "MonthlyIncome": "Monthly income",
    "NumCompaniesWorked": "Prior companies worked",
    "WorkLifeBalance": "Work-life balance",
    "YearsAtCompany": "Years at company",
}


def human_feature(feature: str) -> str:
    return FEATURE_LABELS.get(feature, feature)


def risk_level(probability: float, threshold: float) -> str:
    if probability >= threshold:
        return "high"
    if probability >= threshold * 0.55:
        return "medium"
    return "low"


def format_tenure(years: int) -> str:
    return f"{years} year" if years == 1 else f"{years} years"


def original_feature_name(encoded_name: str, categorical_columns: list[str]) -> str:
    raw = encoded_name.split("__", 1)[-1]
    for column in categorical_columns:
        if raw == column or raw.startswith(f"{column}_"):
            return column
    return raw


@dataclass
class ModelRuntime:
    pipeline: Any
    metadata: dict[str, Any]
    data: pd.DataFrame
    scored: pd.DataFrame

    @classmethod
    def load(cls) -> "ModelRuntime":
        pipeline = joblib.load(settings.model_path)
        metadata = json.loads(settings.metadata_path.read_text(encoding="utf-8"))
        data = pd.read_csv(settings.data_path)
        model_columns = metadata["numeric_columns"] + metadata["categorical_columns"]
        probabilities = pipeline.predict_proba(data[model_columns])[:, 1]
        scored = data.copy()
        scored["RiskProbability"] = probabilities
        return cls(pipeline=pipeline, metadata=metadata, data=data, scored=scored)

    @property
    def threshold(self) -> float:
        return float(self.metadata["threshold"])

    @property
    def model_columns(self) -> list[str]:
        return self.metadata["numeric_columns"] + self.metadata["categorical_columns"]

    def validate_categories(self, record: dict[str, Any]) -> None:
        for column, options in self.metadata["categorical_options"].items():
            value = str(record[column])
            if value not in options:
                raise ValueError(f"{column} must be one of: {', '.join(options)}")

    def local_drivers(self, frame: pd.DataFrame, raw: dict[str, Any], limit: int = 3) -> list[dict[str, Any]]:
        preprocessor = self.pipeline.named_steps["preprocessor"]
        classifier = self.pipeline.named_steps["classifier"]
        transformed = np.asarray(preprocessor.transform(frame))[0]
        names = preprocessor.get_feature_names_out().tolist()
        contributions = transformed * classifier.coef_[0]
        grouped: dict[str, float] = {}
        for name, contribution in zip(names, contributions, strict=True):
            feature = original_feature_name(name, self.metadata["categorical_columns"])
            grouped[feature] = grouped.get(feature, 0.0) + float(contribution)
        ranked = sorted(grouped.items(), key=lambda item: item[1], reverse=True)
        results: list[dict[str, Any]] = []
        for feature, contribution in ranked:
            if contribution <= 0:
                continue
            results.append(
                {
                    "feature": feature,
                    "label": human_feature(feature),
                    "value": raw.get(feature),
                    "contribution": round(contribution, 4),
                    "explanation": self.driver_explanation(feature, raw),
                }
            )
            if len(results) >= limit:
                break
        if not results:
            feature = ranked[0][0]
            results.append(
                {
                    "feature": feature,
                    "label": human_feature(feature),
                    "value": raw.get(feature),
                    "contribution": round(ranked[0][1], 4),
                    "explanation": self.driver_explanation(feature, raw),
                }
            )
        return results

    def driver_explanation(self, feature: str, raw: dict[str, Any]) -> str:
        value = raw.get(feature)
        if feature == "DistanceFromHome":
            return f"Commute distance is {value} miles."
        if feature == "Education":
            return f"Education level is coded as {value} on the source dataset's 1-5 scale."
        if feature == "EducationField":
            return f"Education field is {value}."
        if feature == "EnvironmentSatisfaction":
            return f"Environment satisfaction is {value}/4."
        if feature == "JobSatisfaction":
            return f"Job satisfaction is {value}/4."
        if feature == "MonthlyIncome":
            return f"Monthly income is ${int(value):,}."
        if feature == "NumCompaniesWorked":
            return f"The employee has worked at {value} prior companies."
        if feature == "WorkLifeBalance":
            return f"Work-life balance is {value}/4."
        if feature == "YearsAtCompany":
            return f"Tenure is {format_tenure(int(value))}."
        if feature == "Department":
            return f"Department is {value}."
        return f"{human_feature(feature)} is {value}."

    def recommendation(self, raw: dict[str, Any], top_feature: str) -> str:
        suggestions = {
            "JobSatisfaction": "Schedule a stay interview and review role fit, recognition, and growth opportunities.",
            "EnvironmentSatisfaction": "Review team environment, manager support, workload, and workplace concerns with the employee.",
            "WorkLifeBalance": "Review workload, schedule flexibility, PTO usage, and sustainable staffing options.",
            "MonthlyIncome": "Run a role- and location-adjusted compensation review before taking action.",
            "DistanceFromHome": "Discuss hybrid or flexible-work options where the role allows them.",
            "YearsAtCompany": "Create a documented career-growth and internal-mobility conversation.",
            "NumCompaniesWorked": "Use a stay interview to understand career expectations and likely next-step goals.",
            "Department": "Review department-level workload, manager practices, compensation, and mobility patterns.",
            "EducationField": "Review role alignment and internal opportunities that better match the employee's skills.",
            "Education": "Review development pathways and whether role scope matches the employee's capabilities.",
        }
        return suggestions.get(top_feature, "Conduct a human-reviewed stay interview before any employment action.")

    def predict(self, record: dict[str, Any]) -> dict[str, Any]:
        self.validate_categories(record)
        frame = pd.DataFrame([{column: record[column] for column in self.model_columns}])
        probability = float(self.pipeline.predict_proba(frame)[0, 1])
        drivers = self.local_drivers(frame, record)
        return {
            "probability": round(probability, 6),
            "riskScore": round(probability * 100, 1),
            "riskLevel": risk_level(probability, self.threshold),
            "decisionThreshold": round(self.threshold, 4),
            "aboveInterventionThreshold": probability >= self.threshold,
            "topDrivers": drivers,
            "recommendation": self.recommendation(record, drivers[0]["feature"]),
            "disclaimer": "This is a statistical estimate for human review. Do not use it as the sole basis for an employment decision.",
        }

    def employees(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        model_frame = self.scored[self.model_columns]
        preprocessor = self.pipeline.named_steps["preprocessor"]
        classifier = self.pipeline.named_steps["classifier"]
        transformed = np.asarray(preprocessor.transform(model_frame))
        names = preprocessor.get_feature_names_out().tolist()
        coefficients = classifier.coef_[0]
        categorical_columns = self.metadata["categorical_columns"]

        for index, row in self.scored.iterrows():
            contributions = transformed[index] * coefficients
            grouped: dict[str, float] = {}
            for name, contribution in zip(names, contributions, strict=True):
                feature = original_feature_name(name, categorical_columns)
                grouped[feature] = grouped.get(feature, 0.0) + float(contribution)
            ranked = sorted(grouped.items(), key=lambda item: item[1], reverse=True)
            top_feature = next((feature for feature, value in ranked if value > 0), ranked[0][0])
            probability = float(row["RiskProbability"])
            rows.append(
                {
                    "id": f"DEMO-EMP-{index + 1:04d}",
                    "name": f"Demo Employee {index + 1:04d}",
                    "role": f"{row['EducationField']} · education level {int(row['Education'])}",
                    "department": str(row["Department"]),
                    "tenure": format_tenure(int(row["YearsAtCompany"])),
                    "riskScore": round(probability * 100, 1),
                    "riskLevel": risk_level(probability, self.threshold),
                    "topDriver": self.driver_explanation(top_feature, row.to_dict()),
                    "suggestion": self.recommendation(row.to_dict(), top_feature),
                    "monthlyIncome": int(row["MonthlyIncome"]),
                    "distanceFromHome": int(row["DistanceFromHome"]),
                    "educationLevel": int(row["Education"]),
                    "educationField": str(row["EducationField"]),
                    "environmentSatisfaction": int(row["EnvironmentSatisfaction"]),
                    "jobSatisfaction": int(row["JobSatisfaction"]),
                    "priorCompanies": int(row["NumCompaniesWorked"]),
                    "workLifeBalance": int(row["WorkLifeBalance"]),
                    "yearsAtCompany": int(row["YearsAtCompany"]),
                    "observedAttrition": str(row["Attrition"]),
                }
            )
        return sorted(rows, key=lambda item: item["riskScore"], reverse=True)

    def dashboard(self) -> dict[str, Any]:
        df = self.scored.copy()
        observed_rate = float((df["Attrition"] == "Yes").mean())
        predicted_rate = float(df["RiskProbability"].mean())
        high_risk = int((df["RiskProbability"] >= self.threshold).sum())
        high_risk_payroll = float(
            (df.loc[df["RiskProbability"] >= self.threshold, "MonthlyIncome"] * 12).sum()
        )

        department_rows = []
        for department, group in df.groupby("Department", sort=False):
            department_rows.append(
                {
                    "department": str(department),
                    "headcount": int(len(group)),
                    "attrition": round(float((group["Attrition"] == "Yes").mean()) * 100, 1),
                    "atRisk": int((group["RiskProbability"] >= self.threshold).sum()),
                    "riskScore": round(float(group["RiskProbability"].mean()) * 100, 1),
                }
            )
        department_rows.sort(key=lambda item: item["riskScore"], reverse=True)

        tenure_bins = [-1, 1, 3, 5, 10, math.inf]
        tenure_labels = ["0-1y", "2-3y", "4-5y", "6-10y", "11y+"]
        df["TenureBand"] = pd.cut(
            df["YearsAtCompany"], bins=tenure_bins, labels=tenure_labels, include_lowest=True
        )
        trend = []
        for label in tenure_labels:
            group = df[df["TenureBand"] == label]
            if group.empty:
                continue
            trend.append(
                {
                    "month": label,
                    "actual": round(float((group["Attrition"] == "Yes").mean()) * 100, 1),
                    "predicted": round(float(group["RiskProbability"].mean()) * 100, 1),
                    "benchmark": round(observed_rate * 100, 1),
                    "count": int(len(group)),
                }
            )

        risk_bins = [(0, 10), (10, 20), (20, 30), (30, 50), (50, 100.01)]
        distribution = []
        for low, high in risk_bins:
            count = int(((df["RiskProbability"] * 100 >= low) & (df["RiskProbability"] * 100 < high)).sum())
            midpoint_probability = ((low + min(high, 100)) / 2) / 100
            distribution.append(
                {
                    "band": f"{low}-{int(min(high, 100))}%",
                    "count": count,
                    "level": risk_level(midpoint_probability, self.threshold),
                }
            )

        feature_importance = [
            {
                "feature": human_feature(item["feature"]),
                "importance": round(float(item["importance"]), 6),
            }
            for item in self.metadata["feature_importance"]
        ]
        top_drivers = self.metadata["positive_drivers"][:6]
        driver_total = sum(float(item["share"]) for item in top_drivers) or 1.0
        leave_reasons = [
            {
                "reason": human_feature(item["feature"]),
                "share": round(float(item["share"]) / driver_total * 100, 1),
                "trend": "flat",
            }
            for item in top_drivers
        ]

        hotspot = department_rows[0]
        metrics = self.metadata["metrics"]
        model_metrics = [
            {"label": "Model", "value": self.metadata["model_name"], "hint": self.metadata["model_version"]},
            {"label": "ROC-AUC", "value": f"{metrics['roc_auc']:.2f}", "hint": "5-fold out-of-fold"},
            {"label": "Precision", "value": f"{metrics['precision']:.2f}", "hint": f"At {self.threshold:.2f} threshold"},
            {"label": "Recall", "value": f"{metrics['recall']:.2f}", "hint": f"At {self.threshold:.2f} threshold"},
            {"label": "Rows scored", "value": f"{len(df):,}", "hint": "Uploaded dataset"},
            {"label": "Features", "value": str(self.metadata['dataset']['features']), "hint": "Age/marital excluded"},
        ]

        return {
            "dailyBrief": (
                f"The uploaded dataset contains {len(df):,} historical employee records with an observed "
                f"attrition rate of {observed_rate * 100:.1f}%. {hotspot['department']} has the highest "
                f"average model risk at {hotspot['riskScore']:.1f}%, with {hotspot['atRisk']} records above "
                f"the {self.threshold * 100:.0f}% review threshold."
            ),
            "kpis": [
                {"label": "Dataset records", "value": f"{len(df):,}", "delta": 0, "deltaLabel": "historical rows", "positiveIsGood": True},
                {"label": "Observed attrition", "value": f"{observed_rate * 100:.1f}%", "delta": 0, "deltaLabel": f"{int((df['Attrition'] == 'Yes').sum())} exits", "positiveIsGood": False},
                {"label": "Above review threshold", "value": f"{high_risk:,}", "delta": 0, "deltaLabel": f">= {self.threshold * 100:.0f}% risk", "positiveIsGood": False},
                {"label": "At-risk annual payroll", "value": f"${high_risk_payroll / 1_000_000:.1f}M", "delta": 0, "deltaLabel": "not replacement cost", "positiveIsGood": False},
                {"label": "Mean predicted risk", "value": f"{predicted_rate * 100:.1f}%", "delta": 0, "deltaLabel": "all records", "positiveIsGood": False},
                {"label": "Median monthly income", "value": f"${int(df['MonthlyIncome'].median()):,}", "delta": 0, "deltaLabel": "source dataset", "positiveIsGood": True},
            ],
            "attritionTrend": trend,
            "departmentRisk": department_rows,
            "leaveReasons": leave_reasons,
            "featureImportance": feature_importance,
            "riskDistribution": distribution,
            "modelMetrics": model_metrics,
            "topEmployees": self.employees()[:4],
            "highRiskCount": high_risk,
            "highRiskPayroll": round(high_risk_payroll, 2),
            "threshold": self.threshold,
            "datasetNotes": self.metadata["notes"],
        }

    def data_dictionary(self) -> dict[str, Any]:
        definitions = {
            "Age": "Employee age in years. Retained for descriptive analysis but excluded from the model.",
            "Attrition": "Historical target label: Yes or No.",
            "Department": "Human Resources, Research & Development, or Sales.",
            "DistanceFromHome": "Distance from home in miles.",
            "Education": "Ordinal education code from 1 to 5.",
            "EducationField": "Reported field of education.",
            "EnvironmentSatisfaction": "Ordinal satisfaction score from 1 to 4.",
            "JobSatisfaction": "Ordinal satisfaction score from 1 to 4.",
            "MaritalStatus": "Descriptive field excluded from the model.",
            "MonthlyIncome": "Monthly income in US dollars.",
            "NumCompaniesWorked": "Number of companies previously worked for.",
            "WorkLifeBalance": "Ordinal score from 1 to 4.",
            "YearsAtCompany": "Years employed at the company.",
        }
        return {
            "source": "Uploaded archive.zip / Attrition Data.csv",
            "rows": int(len(self.data)),
            "columns": [
                {
                    "name": column,
                    "definition": definitions.get(column, "Source dataset field."),
                    "usedByModel": column in self.model_columns,
                    "type": str(self.data[column].dtype),
                }
                for column in self.data.columns
            ],
            "categoricalOptions": self.metadata["categorical_options"],
            "numericRanges": self.metadata["numeric_ranges"],
            "notes": self.metadata["notes"],
        }


@lru_cache(maxsize=1)
def get_runtime() -> ModelRuntime:
    return ModelRuntime.load()
