import { AssetInventoryWorkspace } from "@/components/asset-inventory"
import { listAssets } from "@/lib/server/exit-assets"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function AssetsPage() {
  const actor = await requireRequestActor()
  return <AssetInventoryWorkspace initialData={await listAssets({ limit: 25 })} canManage={["admin", "hr"].includes(actor.role)} />
}
