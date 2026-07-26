import { GraduationCap, TrendingUp, Users, Sparkles, ArrowUpRight } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { SkillGapChart } from "@/components/charts/skill-gap-chart"
import { learningTracks, skillRecommendations, skillGaps } from "@/lib/data"

const summary = [
  { label: "Active learners", value: "1,204", icon: Users },
  { label: "Programs live", value: "18", icon: GraduationCap },
  { label: "Avg retention lift", value: "+17%", icon: TrendingUp },
]

export default function LearningPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {summary.map((s) => (
          <Card key={s.label} className="gap-2 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <s.icon className="size-4" />
              <span className="truncate text-xs font-medium">{s.label}</span>
            </div>
            <span className="font-mono text-2xl font-semibold tabular-nums">{s.value}</span>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_1fr]">
        {/* Skill gaps */}
        <Card>
          <CardHeader>
            <CardTitle>Workforce skill gaps</CardTitle>
            <CardDescription>Current capability vs target across critical skills</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SkillGapChart />
            <div className="flex flex-col gap-2.5">
              {skillGaps.map((s) => (
                <div key={s.skill} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.skill}</span>
                    <span className="font-mono tabular-nums">
                      {s.current} / {s.target}
                    </span>
                  </div>
                  <Progress value={(s.current / s.target) * 100} className="h-1.5" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Learning tracks */}
        <Card>
          <CardHeader>
            <CardTitle>Learning tracks tied to retention</CardTitle>
            <CardDescription>Programs mapped to the attrition drivers they counter</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {learningTracks.map((t) => (
              <div key={t.id} className="rounded-xl bg-muted/40 p-3.5 ring-1 ring-border/60">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.category} · {t.enrolled} enrolled · counters &ldquo;{t.linkedRisk}&rdquo;
                    </p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                    <ArrowUpRight className="size-3" />
                    {t.retentionLift}% retention
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <Progress value={t.completion} className="h-1.5 flex-1" />
                  <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {t.completion}%
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* AI recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="size-3.5" />
            </span>
            AI-matched learning for at-risk employees
          </CardTitle>
          <CardDescription>
            Personalized upskilling that addresses each person&apos;s top attrition driver
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {skillRecommendations.map((r) => (
            <div key={r.name} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3.5 ring-1 ring-border/60">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {r.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.role}</p>
                </div>
              </div>
              <div className="rounded-lg bg-primary/5 p-2.5">
                <p className="text-sm font-medium text-primary">{r.recommendation}</p>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{r.reason}</p>
              </div>
              <Button size="sm" variant="outline" className="w-full">
                Enroll & notify manager
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
