# Production deployment

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
