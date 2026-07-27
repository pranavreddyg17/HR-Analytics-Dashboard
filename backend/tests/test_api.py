from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["rows"] == 1470


def test_dashboard_is_real_dataset() -> None:
    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["kpis"][0]["value"] == "1,470"
    assert len(body["departmentRisk"]) == 3


def test_prediction() -> None:
    response = client.post(
        "/api/v1/predict",
        json={
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
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert 0 <= body["probability"] <= 1
    assert body["riskLevel"] in {"low", "medium", "high"}
    assert body["topDrivers"]


def test_schema_and_employees() -> None:
    schema = client.get("/api/v1/schema")
    assert schema.status_code == 200
    assert "Age" in schema.json()["excludedFromModel"]

    employees = client.get("/api/v1/employees?risk=high&limit=5")
    assert employees.status_code == 200
    body = employees.json()
    assert body["total"] >= len(body["items"])
    assert len(body["items"]) <= 5


def test_grounded_chat() -> None:
    response = client.post("/api/v1/chat", json={"message": "Which department is highest risk?"})
    assert response.status_code == 200
    assert "highest average predicted risk" in response.json()["answer"]


def test_action_status_round_trip() -> None:
    update = client.post("/api/v1/actions/A-01", json={"status": "running"})
    assert update.status_code == 200
    actions = client.get("/api/v1/actions")
    assert actions.status_code == 200
    action = next(item for item in actions.json()["items"] if item["id"] == "A-01")
    assert action["status"] == "running"
