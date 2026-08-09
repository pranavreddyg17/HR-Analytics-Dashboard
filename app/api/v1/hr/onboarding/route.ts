import { NextResponse } from "next/server"

import { listOnboardingOperations } from "@/lib/server/onboarding"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listOnboardingOperations(await requireRequestActor(request)))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load onboarding operations." }, { status })
  }
}
