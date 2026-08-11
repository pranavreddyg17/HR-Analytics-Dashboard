# Production deployment

## Resource naming and ownership

All application resources are in the existing `Laidback.ai` resource group. Terraform applies the `application=laidbackhr`, `environment=production`, and `managed_by=terraform` tags to managed resources. The bootstrap deployment identity and Terraform-state account are tagged separately with their purposes.

The stable suffix `f61hno` was generated once by Terraform to satisfy Azure's global-name requirements. It is not an environment or application version. Changing it would replace stateful resources, so use tags and Terraform outputs to identify purpose instead of renaming deployed resources.

| Resource | Purpose |
|---|---|
| `laidbackhr-azdo-deploy` | Federated GitHub Actions and Azure DevOps deployment identity |
| `laidbackhrtf7981312c` | Remote Terraform state; the numeric suffix identifies the subscription |
| `laidbackhr-f61hno-web` and `laidbackhr-production-plan` | Next.js App Service and its cost-controlled Linux plan |
| `laidbackhr-f61hno-pg` | PostgreSQL system of record |
| `laidbackhr-f61hno-kv` | Runtime secrets and configuration references |
| `laidbackhrf61hno` | Active `laidbackhr-web` container images and rollback tags |
| `laidbackhrf61hnodocs` | Private employee-document blobs |
| `laidbackhr-production-insights` and `laidbackhr-production-logs` | App Service-managed Node.js telemetry and its Log Analytics workspace |
| `laidbackhr-production-vnet` | Application network with dedicated App Service integration and private-endpoint subnets |

## Operations monitor access

The web app managed identity reads application telemetry and resource-group cost through Azure control-plane APIs. These roles are intentionally bootstrapped by a resource-group access administrator rather than by the deployment identity, which does not receive permission to grant roles:

```bash
WEB_PRINCIPAL_ID="$(az webapp identity show --resource-group Laidback.ai --name laidbackhr-f61hno-web --query principalId -o tsv)"
RG_SCOPE="/subscriptions/7981312c-4577-455a-8bae-10269b74a97b/resourceGroups/Laidback.ai"
az role assignment create --assignee-object-id "$WEB_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal --role "Monitoring Reader" --scope "$RG_SCOPE"
az role assignment create --assignee-object-id "$WEB_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal --role "Cost Management Reader" --scope "$RG_SCOPE"
```

The production identity already has both assignments. The admin page continues to show internal PostgreSQL usage if an Azure provider is temporarily unavailable.

## Network controls

Terraform creates `10.42.0.0/16`, delegates `10.42.1.0/26` to App Service, and reserves `10.42.2.0/27` for private endpoints. PostgreSQL public access is not disabled by this change; moving the live database to Private Link requires an explicit migration and DNS validation. Reviewed source CIDRs can be denied through `blocked_ip_cidrs`. Do not commit copied public blocklists: use Azure Web Application Firewall threat intelligence when managed threat feeds are required.

## Employee portal DNS

Create these records with the authoritative DNS provider for `laidbackhr.cloud` before enabling the Terraform hostname binding:

| Type | Host | Value |
|---|---|---|
| CNAME | `employee` | `laidbackhr-f61hno-web.azurewebsites.net` |
| TXT | `asuid.employee` | `923A12B148EFC1A3B770FCF66B4B7D944691FE9D2DD2D5F106A9CF88554A009F` |

Then add `https://employee.laidbackhr.cloud` as an authorized JavaScript origin in the existing Google OAuth web client. The OAuth redirect URI remains `https://www.laidbackhr.cloud/api/auth/callback/google` because sign-in is canonicalized through the main workspace.

After DNS propagation, set:

```hcl
enable_employee_custom_domain = true
```

The next GitHub Actions deployment will create the App Service hostname binding and managed certificate.

## Azure OpenAI deployment

Production uses the verified `gpt-5.2` deployment exposed by the approved shared Foundry endpoint. `azure_openai_model` is the deployment name, not a guessed base-model alias. Search and embeddings remain independently available; if generation is unavailable, the application falls back to its evidence-only deterministic response path.

## Database

The web app reads `DATABASE_URL` from the application Key Vault and requires TLS. Migrations are append-only and run at startup. Demo reconciliation is disabled in production with `SEED_DEMO_DATA=false`.

## Configuration files

- `backend.hcl` identifies the Azure AD-authenticated remote Terraform state.
- `production.tfvars` contains the non-secret identifiers and settings for this deployed environment.
- secrets are copied from the protected GitHub `production` environment into the application Key Vault; they are never stored in either Terraform variables file.

GitHub Actions is the only production apply owner. Azure DevOps validates the mirrored commit and waits for that exact SHA to appear at `/api/v1/ready`.
