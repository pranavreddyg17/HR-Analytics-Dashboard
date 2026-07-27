"use client"

import { useMemo, useState } from "react"
import { Brain, Loader2, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskBadge } from "@/components/risk-badge"
import { apiBaseUrl } from "@/lib/api"
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
      const response = await fetch(`${apiBaseUrl}/api/v1/predict`, {
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

  const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader>
          <CardTitle>Score an employee profile</CardTitle>
          <CardDescription>
            Submit the ten non-sensitive model fields to the production prediction endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Department
              <select className={fieldClass} value={form.Department} onChange={(event) => update("Department", event.target.value)}>
                {schema.categoricalOptions.Department?.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
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

            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={loading} className="gap-2">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
                Run prediction
              </Button>
              <span className="text-xs text-muted-foreground">
                Review threshold: {(schema.threshold * 100).toFixed(0)}%
              </span>
            </div>
            {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prediction result</CardTitle>
          <CardDescription>Probability, model drivers, and a human-review recommendation</CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl bg-muted/30 p-6 text-center">
              <Brain className="size-8 text-primary" />
              <p className="text-sm text-muted-foreground">Complete the form and run the deployed model.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Predicted attrition probability</p>
                  <p className="font-mono text-4xl font-semibold tabular-nums">{result.riskScore.toFixed(1)}%</p>
                </div>
                <RiskBadge level={result.riskLevel} />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Top model contributions</p>
                {result.topDrivers.map((driver) => (
                  <div key={driver.feature} className="rounded-lg bg-muted/30 p-3">
                    <p className="text-sm font-medium">{driver.label}</p>
                    <p className="text-xs text-muted-foreground">{driver.explanation}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary">Human-review recommendation</p>
                <p className="mt-1 text-sm">{result.recommendation}</p>
              </div>

              <div className="flex gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <p>{result.disclaimer}</p>
              </div>
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
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(integer(event.target.value))}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      />
    </label>
  )
}
