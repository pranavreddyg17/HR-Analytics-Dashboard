import { Database, ShieldCheck, Binary, FileSpreadsheet } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getDataDictionary, getModelMetadata } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default async function DataModelPage() {
  const dictionary = getDataDictionary()
  const model = getModelMetadata()
  const metrics = model.metrics as Record<string, number | number[][]>
  const summary = [
    { label: "Source rows", value: dictionary.rows.toLocaleString(), icon: FileSpreadsheet },
    { label: "Model features", value: String(model.dataset.features), icon: Binary },
    { label: "ROC-AUC", value: Number(metrics.roc_auc).toFixed(2), icon: ShieldCheck },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {summary.map((item) => (
          <Card key={item.label} className="gap-2 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="size-4" />
              <span className="truncate text-xs font-medium">{item.label}</span>
            </div>
            <span className="font-mono text-2xl font-semibold tabular-nums">{item.value}</span>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            Dataset and model provenance
          </CardTitle>
          <CardDescription>{dictionary.source}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border/60">
            <p className="text-xs font-medium text-muted-foreground">Deployed model</p>
            <p className="mt-1 text-lg font-semibold">{model.model_name}</p>
            <p className="text-sm text-muted-foreground">Version {model.model_version} · {model.evaluation}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Trained {new Date(model.trained_at).toLocaleString()} · review threshold {(model.threshold * 100).toFixed(0)}%
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border/60">
            <p className="text-xs font-medium text-muted-foreground">Historical target</p>
            <p className="mt-1 text-lg font-semibold">{model.dataset.positive_rows} attrition cases</p>
            <p className="text-sm text-muted-foreground">
              {model.dataset.negative_rows} non-attrition cases · {(model.dataset.observed_attrition_rate * 100).toFixed(1)}% observed rate
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Excluded from training: {model.dataset.excluded_from_model.join(", ")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source data dictionary</CardTitle>
          <CardDescription>Every field in the uploaded CSV and whether the deployed model uses it</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Column</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Model use</th>
                <th className="px-3 py-2 font-medium">Definition</th>
              </tr>
            </thead>
            <tbody>
              {dictionary.columns.map((column) => (
                <tr key={column.name} className="border-b border-border/60 align-top">
                  <td className="px-3 py-3 font-mono text-xs">{column.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{column.type}</td>
                  <td className="px-3 py-3">
                    <Badge variant={column.usedByModel ? "default" : "secondary"}>
                      {column.usedByModel ? "Used" : "Excluded"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{column.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Production limitations</CardTitle>
          <CardDescription>Controls that must remain visible when this demo is extended</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {dictionary.notes.map((note) => (
            <div key={note} className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
              {note}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
