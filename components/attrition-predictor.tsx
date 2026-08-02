"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskBadge } from "@/components/risk-badge"
import type { PredictionInput, PredictionResult, PredictionSchema } from "@/lib/types"

function integer(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function AttritionPredictor({ schema }: { schema: PredictionSchema }) {
  const initial = useMemo<PredictionInput>(() => ({
    Department: schema.categoricalOptions.Department?.[0] ?? "Research & Development",
    DistanceFromHome: schema.numericRanges.DistanceFromHome?.median ?? 7,
    Education: schema.numericRanges.Education?.median ?? 3,
    EducationField: schema.categoricalOptions.EducationField?.[0] ?? "Life Sciences",
    EnvironmentSatisfaction: schema.numericRanges.EnvironmentSatisfaction?.median ?? 3,
    JobSatisfaction: schema.numericRanges.JobSatisfaction?.median ?? 3,
    MonthlyIncome: schema.numericRanges.MonthlyIncome?.median ?? 4919,
    NumCompaniesWorked: schema.numericRanges.NumCompaniesWorked?.median ?? 2,
    WorkLifeBalance: schema.numericRanges.WorkLifeBalance?.median ?? 3,
    YearsAtCompany: schema.numericRanges.YearsAtCompany?.median ?? 5,
  }), [schema])

  const [form, setForm] = useState<PredictionInput>(initial)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof PredictionInput>(key: K, value: PredictionInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/v1/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || `Prediction failed (${response.status})`)
      }
      setResult(await response.json() as PredictionResult)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prediction failed")
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setForm(initial)
    setResult(null)
    setError(null)
  }

  const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-control outline-none focus:ring-2 focus:ring-ring/40"

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle>Risk inputs</CardTitle>
          <CardDescription>Adjust the fields used by the model.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-4">
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-label font-semibold text-muted-foreground">
              Department
              <select className={fieldClass} value={form.Department} onChange={(event) => update("Department", event.target.value)}>
                {schema.categoricalOptions.Department?.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-label font-semibold text-muted-foreground">
              Education field
              <select className={fieldClass} value={form.EducationField} onChange={(event) => update("EducationField", event.target.value)}>
                {schema.categoricalOptions.EducationField?.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>

            <NumberField label="Distance from home" value={form.DistanceFromHome} min={0} max={100} onChange={(value) => update("DistanceFromHome", value)} />
            <NumberField label="Monthly income" value={form.MonthlyIncome} min={0} max={1000000} onChange={(value) => update("MonthlyIncome", value)} />
            <NumberField label="Education level (1-5)" value={form.Education} min={1} max={5} onChange={(value) => update("Education", value)} />
            <NumberField label="Environment satisfaction (1-4)" value={form.EnvironmentSatisfaction} min={1} max={4} onChange={(value) => update("EnvironmentSatisfaction", value)} />
            <NumberField label="Job satisfaction (1-4)" value={form.JobSatisfaction} min={1} max={4} onChange={(value) => update("JobSatisfaction", value)} />
            <NumberField label="Work-life balance (1-4)" value={form.WorkLifeBalance} min={1} max={4} onChange={(value) => update("WorkLifeBalance", value)} />
            <NumberField label="Prior companies worked" value={form.NumCompaniesWorked} min={0} max={100} onChange={(value) => update("NumCompaniesWorked", value)} />
            <NumberField label="Years at company" value={form.YearsAtCompany} min={0} max={100} onChange={(value) => update("YearsAtCompany", value)} />

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={loading} className="gap-2">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Calculate
              </Button>
              <Button type="button" variant="outline" onClick={reset} disabled={loading}>
                Reset
              </Button>
              <span className="text-meta text-muted-foreground">
                Threshold {(schema.threshold * 100).toFixed(0)}%
              </span>
            </div>
            {error && <p className="text-body text-destructive sm:col-span-2 lg:col-span-3">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle>Result</CardTitle>
          <CardDescription>Estimated probability and contributing signals.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-4">
          {!result ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border p-6 text-center">
              <p className="text-card-title font-semibold">Ready to calculate</p>
              <p className="max-w-xs text-meta text-muted-foreground">Use the profile inputs to generate an explainable estimate.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-md border border-border p-4">
                <div>
                  <p className="text-meta text-muted-foreground">Predicted attrition probability</p>
                  <p className="text-kpi font-semibold tabular-nums">{result.riskScore.toFixed(1)}%</p>
                </div>
                <RiskBadge level={result.riskLevel} />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-label font-semibold text-muted-foreground">Top model contributions</p>
                {result.topDrivers.map((driver) => (
                  <div key={driver.feature} className="rounded-md border border-border p-3">
                    <p className="text-card-title font-semibold">{driver.label}</p>
                    <p className="text-meta text-muted-foreground">{driver.explanation}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-border bg-muted/25 p-3">
                <p className="text-label font-semibold">Recommended HR review</p>
                <p className="mt-1 text-body">{result.recommendation}</p>
              </div>

              <div className="border-l-2 border-warning px-3 py-2 text-meta text-warning">{result.disclaimer}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1.5 text-label font-semibold text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(integer(event.target.value))}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-control text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      />
    </label>
  )
}
