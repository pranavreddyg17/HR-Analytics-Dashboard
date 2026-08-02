from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    Department: str
    DistanceFromHome: int = Field(ge=0, le=100)
    Education: int = Field(ge=1, le=5)
    EducationField: str
    EnvironmentSatisfaction: int = Field(ge=1, le=4)
    JobSatisfaction: int = Field(ge=1, le=4)
    MonthlyIncome: int = Field(ge=0, le=1_000_000)
    NumCompaniesWorked: int = Field(ge=0, le=100)
    WorkLifeBalance: int = Field(ge=1, le=4)
    YearsAtCompany: int = Field(ge=0, le=100)

    @field_validator("Department", "EducationField")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value
