from app.services import ModelRuntime


def test_runtime_loads_validated_dataset() -> None:
    runtime = ModelRuntime.load()
    assert len(runtime.data) == 1470
    assert runtime.metadata["model_family"] == "gradient_boosting"


def test_dashboard_uses_model_dataset() -> None:
    dashboard = ModelRuntime.load().dashboard()
    assert dashboard["kpis"][0]["value"] == "1,470"
    assert len(dashboard["departmentRisk"]) == 3


def test_prediction_is_explainable() -> None:
    result = ModelRuntime.load().predict(
        {
            "Department": "Sales",
            "DistanceFromHome": 10,
            "Education": 3,
            "EducationField": "Marketing",
            "EnvironmentSatisfaction": 2,
            "JobSatisfaction": 2,
            "MonthlyIncome": 4500,
            "NumCompaniesWorked": 3,
            "WorkLifeBalance": 2,
            "YearsAtCompany": 2,
        }
    )
    assert 0 <= result["probability"] <= 1
    assert result["riskLevel"] in {"low", "medium", "high"}
    assert result["topDrivers"]


def test_schema_metadata_and_scored_records() -> None:
    runtime = ModelRuntime.load()
    assert "Age" in runtime.metadata["dataset"]["excluded_from_model"]
    employees = runtime.employees()
    high_risk = [employee for employee in employees if employee["riskLevel"] == "high"][:5]
    assert high_risk
    assert len(high_risk) <= 5
