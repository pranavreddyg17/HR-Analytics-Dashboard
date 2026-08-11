import { AssetDetailWorkspace } from "@/components/asset-detail"
import { getAsset } from "@/lib/server/exit-assets"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function AssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const actor = await requireRequestActor()
  const { assetId } = await params
  return <AssetDetailWorkspace initialData={await getAsset(assetId)} canManage={["admin", "hr"].includes(actor.role)} />
}
