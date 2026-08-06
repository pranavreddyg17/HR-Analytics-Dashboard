"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskBadge } from "@/components/risk-badge"
import type { PredictionInput, PredictionResult, PredictionSchema } from "@/lib/types"

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
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const [resetVersion, setResetVersion] = useState(0)

  function update<K extends keyof PredictionInput>(key: K, value: PredictionInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (invalidFields.size) {
      setError("Complete the highlighted fields before calculating.")
      return
    }
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
    setInvalidFields(new Set())
    setResetVersion((current) => current + 1)
  }

  function setFieldValidity(field: string, valid: boolean) {
    setInvalidFields((current) => {
      const next = new Set(current)
      if (valid) next.delete(field)
      else next.add(field)
      return next
    })
  }

  const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-control outline-none focus:ring-2 focus:ring-ring/40"

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle>Risk inputs</CardTitle>
          <CardDescription>Test a historical scenario.</CardDescription>
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

            <NumberField key={`distance-${resetVersion}`} field="DistanceFromHome" label="Distance from home" value={form.DistanceFromHome} range={schema.numericRanges.DistanceFromHome} onChange={(value) => update("DistanceFromHome", value)} onValidityChange={setFieldValidity} />
            <NumberField key={`income-${resetVersion}`} field="MonthlyIncome" label="Monthly income" value={form.MonthlyIncome} range={schema.numericRanges.MonthlyIncome} onChange={(value) => update("MonthlyIncome", value)} onValidityChange={setFieldValidity} />
            <NumberField key={`education-${resetVersion}`} field="Education" label="Education level (1-5)" value={form.Education} range={schema.numericRanges.Education} onChange={(value) => update("Education", value)} onValidityChange={setFieldValidity} />
            <NumberField key={`environment-${resetVersion}`} field="EnvironmentSatisfaction" label="Environment satisfaction (1-4)" value={form.EnvironmentSatisfaction} range={schema.numericRanges.EnvironmentSatisfaction} onChange={(value) => update("EnvironmentSatisfaction", value)} onValidityChange={setFieldValidity} />
            <NumberField key={`satisfaction-${resetVersion}`} field="JobSatisfaction" label="Job satisfaction (1-4)" value={form.JobSatisfaction} range={schema.numericRanges.JobSatisfaction} onChange={(value) => update("JobSatisfaction", value)} onValidityChange={setFieldValidity} />
            <NumberField key={`balance-${resetVersion}`} field="WorkLifeBalance" label="Work-life balance (1-4)" value={form.WorkLifeBalance} range={schema.numericRanges.WorkLifeBalance} onChange={(value) => update("WorkLifeBalance", value)} onValidityChange={setFieldValidity} />
            <NumberField key={`companies-${resetVersion}`} field="NumCompaniesWorked" label="Prior companies worked" value={form.NumCompaniesWorked} range={schema.numericRanges.NumCompaniesWorked} onChange={(value) => update("NumCompaniesWorked", value)} onValidityChange={setFieldValidity} />
            <NumberField key={`tenure-${resetVersion}`} field="YearsAtCompany" label="Years at company" value={form.YearsAtCompany} range={schema.numericRanges.YearsAtCompany} onChange={(value) => update("YearsAtCompany", value)} onValidityChange={setFieldValidity} />

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={loading} className="gap-2">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Calculate
              </Button>
              <Button type="button" variant="outline" onClick={reset} disabled={loading}>
                Reset
              </Button>
              <span className="text-meta text-muted-foreground">
                Model {schema.modelVersion} · review threshold {(schema.threshold * 100).toFixed(0)}%
              </span>
            </div>
            {error && <p className="text-body text-destructive sm:col-span-2 lg:col-span-3">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle>Result</CardTitle>
          <CardDescription>Score and strongest sensitivities.</CardDescription>
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

              <p className="text-meta text-muted-foreground">
                Reference profile estimate {(result.referenceProbability * 100).toFixed(1)}%. The comparison changes one field at a time and is not a causal explanation.
              </p>

              <div className="flex flex-col gap-2">
                <p className="text-label font-semibold text-muted-foreground">Local sensitivity</p>
                {result.topDrivers.map((driver) => (
                  <div key={driver.feature} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-card-title font-semibold">{driver.label}</p>
                      <p className="text-meta tabular-nums text-muted-foreground">{driver.contribution >= 0 ? "+" : ""}{driver.contribution.toFixed(1)} points</p>
                    </div>
                    <p className="text-meta text-muted-foreground">{driver.explanation}</p>
                    <p className="mt-1 text-meta text-muted-foreground">Reference value: {String(driver.referenceValue)}</p>
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
  field,
  value,
  range,
  onChange,
  onValidityChange,
}: {
  label: string
  field: string
  value: number
  range: { min: number; max: number; median: number }
  onChange: (value: number) => void
  onValidityChange: (field: string, valid: boolean) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [valid, setValid] = useState(true)

  function change(next: string) {
    setDraft(next)
    const parsed = Number(next)
    const isValid = next.trim() !== ""
      && Number.isInteger(parsed)
      && parsed >= range.min
      && parsed <= range.max
    setValid(isValid)
    onValidityChange(field, isValid)
    if (isValid) onChange(parsed)
  }

  function normalize() {
    if (!valid) return
    setDraft(String(Number(draft)))
  }

  return (
    <label className="flex flex-col gap-1.5 text-label font-semibold text-muted-foreground">
      {label}
      <input
        type="number"
        value={draft}
        min={range.min}
        max={range.max}
        aria-invalid={!valid}
        onChange={(event) => change(event.target.value)}
        onBlur={normalize}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-control text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      />
      {!valid && <span className="text-meta font-normal text-destructive">Enter {range.min}–{range.max}.</span>}
    </label>
  )
}
