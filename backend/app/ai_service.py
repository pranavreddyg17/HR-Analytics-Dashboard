from __future__ import annotations

import json
from typing import Any

import httpx

from .config import settings
from .services import ModelRuntime


class AnalyticsAssistant:
    def __init__(self, runtime: ModelRuntime) -> None:
        self.runtime = runtime

    async def answer(self, message: str) -> dict[str, Any]:
        dashboard = self.runtime.dashboard()
        if settings.azure_openai_endpoint and settings.azure_openai_api_key and settings.azure_openai_deployment:
            try:
                answer = await self._azure_openai_answer(message, dashboard)
                return {"answer": answer, "provider": "azure-openai"}
            except Exception:
                pass
        return {"answer": self._deterministic_answer(message, dashboard), "provider": "analytics-engine"}

    async def _azure_openai_answer(self, message: str, dashboard: dict[str, Any]) -> str:
        endpoint = settings.azure_openai_endpoint.rstrip("/")
        url = f"{endpoint}/openai/v1/responses"
        context = {
            "dailyBrief": dashboard["dailyBrief"],
            "departmentRisk": dashboard["departmentRisk"],
            "modelMetrics": dashboard["modelMetrics"],
            "topDrivers": dashboard["leaveReasons"],
            "datasetNotes": dashboard["datasetNotes"],
        }
        system_text = (
            "You are an HR analytics assistant. Answer only from the supplied JSON. "
            "Do not infer names, managers, locations, causes, future trends, or causal effects. "
            "State that the dataset is historical and model outputs require human review.\n\n"
            + json.dumps(context)
        )
        payload = {
            "model": settings.azure_openai_deployment,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": system_text}],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": message}],
                },
            ],
            "max_output_tokens": 450,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                headers={"api-key": settings.azure_openai_api_key, "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
            body = response.json()

        if isinstance(body.get("output_text"), str):
            return body["output_text"].strip()
        chunks: list[str] = []
        for item in body.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    chunks.append(str(content["text"]))
        if not chunks:
            raise ValueError("Azure OpenAI response contained no output text")
        return "\n".join(chunks).strip()

    def _deterministic_answer(self, message: str, dashboard: dict[str, Any]) -> str:
        text = message.lower()
        hotspot = dashboard["departmentRisk"][0]
        metrics = {item["label"]: item["value"] for item in dashboard["modelMetrics"]}
        drivers = ", ".join(
            f"{item['reason']} ({item['share']:.1f}%)" for item in dashboard["leaveReasons"][:4]
        )
        if "department" in text or "highest" in text or "sales" in text:
            return (
                f"{hotspot['department']} has the highest average predicted risk at "
                f"{hotspot['riskScore']:.1f}%. It contains {hotspot['headcount']} historical records, "
                f"{hotspot['atRisk']} above the review threshold, and an observed attrition rate of "
                f"{hotspot['attrition']:.1f}%."
            )
        if "model" in text or "accuracy" in text or "auc" in text or "performance" in text:
            return (
                f"The backend uses {metrics['Model']}. Its 5-fold out-of-fold ROC-AUC is {metrics['ROC-AUC']}, "
                f"precision is {metrics['Precision']}, and recall is {metrics['Recall']}. Age and marital status "
                "are excluded from training. The model is a review aid, not an automated employment decision system."
            )
        if "driver" in text or "why" in text or "reason" in text:
            return (
                f"The strongest global model signals are {drivers}. These are associations learned from the "
                "historical dataset, not proven causes of attrition."
            )
        if "risk" in text or "summary" in text or "brief" in text:
            return dashboard["dailyBrief"] + " Model outputs require human review."
        return (
            dashboard["dailyBrief"]
            + " Ask about the highest-risk department, model performance, global risk drivers, or the review threshold."
        )
