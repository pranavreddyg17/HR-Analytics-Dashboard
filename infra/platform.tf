resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "random_password" "postgres" {
  length  = 32
  special = true
}

resource "random_password" "auth_secret" {
  length  = 48
  special = false
}

resource "azurerm_container_registry" "app" {
  name                          = "laidbackhr${random_string.suffix.result}"
  resource_group_name           = local.resource_group_name
  location                      = local.location
  sku                           = "Basic"
  admin_enabled                 = false
  public_network_access_enabled = true
  tags                          = merge(local.common_tags, { component = "container-registry" })
}

resource "azurerm_storage_account" "employee_documents" {
  name                            = "laidbackhr${random_string.suffix.result}docs"
  resource_group_name             = local.resource_group_name
  location                        = local.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = true
  shared_access_key_enabled       = false
  tags                            = merge(local.common_tags, { component = "employee-documents" })

  blob_properties {
    versioning_enabled = true
    delete_retention_policy { days = 7 }
    container_delete_retention_policy { days = 7 }
  }
}

resource "azurerm_storage_container" "employee_documents" {
  name                  = "employee-documents"
  storage_account_id    = azurerm_storage_account.employee_documents.id
  container_access_type = "private"
}

resource "azurerm_service_plan" "app" {
  name                = "laidbackhr-${var.environment}-plan"
  resource_group_name = local.resource_group_name
  location            = local.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = merge(local.common_tags, { component = "application-hosting" })
}

resource "azurerm_virtual_network" "app" {
  name                = "laidbackhr-${var.environment}-vnet"
  resource_group_name = local.resource_group_name
  location            = local.location
  address_space       = [var.virtual_network_cidr]
  tags                = merge(local.common_tags, { component = "application-network" })
}

resource "azurerm_network_security_group" "app_integration" {
  name                = "laidbackhr-${var.environment}-app-nsg"
  resource_group_name = local.resource_group_name
  location            = local.location
  tags                = merge(local.common_tags, { component = "application-network" })
}

resource "azurerm_subnet" "app_integration" {
  name                 = "app-integration"
  resource_group_name  = local.resource_group_name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = [var.app_integration_subnet_cidr]
  service_endpoints    = ["Microsoft.Storage"]

  delegation {
    name = "app-service"
    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_subnet_network_security_group_association" "app_integration" {
  subnet_id                 = azurerm_subnet.app_integration.id
  network_security_group_id = azurerm_network_security_group.app_integration.id
}

resource "azurerm_subnet" "private_endpoints" {
  name                              = "private-endpoints"
  resource_group_name               = local.resource_group_name
  virtual_network_name              = azurerm_virtual_network.app.name
  address_prefixes                  = [var.private_endpoint_subnet_cidr]
  private_endpoint_network_policies = "Disabled"
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = "laidbackhr-${var.environment}-logs"
  resource_group_name = local.resource_group_name
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = merge(local.common_tags, { component = "observability-logs" })
}

resource "azurerm_application_insights" "app" {
  name                = "laidbackhr-${var.environment}-insights"
  resource_group_name = local.resource_group_name
  location            = local.location
  workspace_id        = azurerm_log_analytics_workspace.app.id
  application_type    = "web"
  tags                = merge(local.common_tags, { component = "observability-apm" })
}

resource "azurerm_postgresql_flexible_server" "app" {
  name                          = "laidbackhr-${random_string.suffix.result}-pg"
  resource_group_name           = local.resource_group_name
  location                      = local.location
  version                       = "16"
  administrator_login           = "laidbackhradmin"
  administrator_password        = random_password.postgres.result
  sku_name                      = var.postgres_sku
  storage_mb                    = 32768
  auto_grow_enabled             = true
  backup_retention_days         = 7
  geo_redundant_backup_enabled  = false
  public_network_access_enabled = true
  tags                          = merge(local.common_tags, { component = "system-of-record" })

  authentication {
    active_directory_auth_enabled = false
    password_auth_enabled         = true
  }

  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = "laidbackhr"
  server_id = azurerm_postgresql_flexible_server.app.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.app.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_key_vault" "app" {
  name                       = "laidbackhr-${random_string.suffix.result}-kv"
  resource_group_name        = local.resource_group_name
  location                   = local.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 7
  tags                       = merge(local.common_tags, { component = "application-secrets" })
}

resource "azurerm_role_assignment" "deployment_key_vault_secrets" {
  scope                            = azurerm_key_vault.app.id
  role_definition_name             = "Key Vault Secrets Officer"
  principal_id                     = var.deployment_principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "deployment_acr_push" {
  scope                            = azurerm_container_registry.app.id
  role_definition_name             = "AcrPush"
  principal_id                     = var.deployment_principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "deployment_state_blob" {
  scope                            = data.azurerm_storage_account.terraform_state.id
  role_definition_name             = "Storage Blob Data Contributor"
  principal_id                     = var.deployment_principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "bootstrap_key_vault_secrets" {
  count = var.bootstrap_principal_id == null ? 0 : 1

  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.bootstrap_principal_id
  principal_type       = "User"
}

resource "azurerm_key_vault_secret" "database_url" {
  name         = "database-url"
  value        = "postgresql://laidbackhradmin:${urlencode(random_password.postgres.result)}@${azurerm_postgresql_flexible_server.app.fqdn}:5432/${azurerm_postgresql_flexible_server_database.app.name}?sslmode=require"
  key_vault_id = azurerm_key_vault.app.id
  depends_on = [
    azurerm_role_assignment.deployment_key_vault_secrets,
    azurerm_role_assignment.bootstrap_key_vault_secrets,
  ]
}

resource "azurerm_key_vault_secret" "auth_secret" {
  name         = "auth-secret"
  value        = random_password.auth_secret.result
  key_vault_id = azurerm_key_vault.app.id
  depends_on = [
    azurerm_role_assignment.deployment_key_vault_secrets,
    azurerm_role_assignment.bootstrap_key_vault_secrets,
  ]
}

locals {
  web_name                          = "laidbackhr-${random_string.suffix.result}-web"
  key_vault_database_reference      = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.database_url.versionless_id})"
  key_vault_auth_reference          = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.auth_secret.versionless_id})"
  key_vault_google_id_reference     = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=google-client-id)"
  key_vault_google_secret_reference = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=google-client-secret)"
  ai_search_endpoint_reference      = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=azure-ai-search-endpoint)"
  ai_search_key_reference           = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=azure-ai-search-key)"
  azure_openai_endpoint_reference   = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=azure-openai-endpoint)"
  azure_openai_key_reference        = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=azure-openai-key)"
  embedding_endpoint_reference      = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=azure-openai-embedding-endpoint)"
  embedding_key_reference           = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.app.name};SecretName=azure-openai-embedding-key)"
}

# The prediction runtime moved into the web application. Forget the former
# model App Service without asking the deployment identity to delete the
# legacy ACR role assignment, which is outside its conditional RBAC scope.
removed {
  from = azurerm_linux_web_app.model

  lifecycle {
    destroy = false
  }
}

removed {
  from = azurerm_role_assignment.model_acr_pull

  lifecycle {
    destroy = false
  }
}

resource "azurerm_linux_web_app" "web" {
  name                                           = local.web_name
  resource_group_name                            = local.resource_group_name
  location                                       = local.location
  service_plan_id                                = azurerm_service_plan.app.id
  https_only                                     = true
  public_network_access_enabled                  = true
  client_certificate_enabled                     = false
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false
  virtual_network_subnet_id                      = azurerm_subnet.app_integration.id
  tags                                           = merge(local.common_tags, { component = "hr-web-application" })

  identity { type = "SystemAssigned" }

  site_config {
    always_on                               = true
    health_check_path                       = "/api/v1/ready"
    health_check_eviction_time_in_min       = 5
    container_registry_use_managed_identity = true
    minimum_tls_version                     = "1.2"
    http2_enabled                           = true
    ip_restriction_default_action           = "Allow"
    vnet_route_all_enabled                  = false

    dynamic "ip_restriction" {
      for_each = { for index, cidr in var.blocked_ip_cidrs : index => cidr }
      content {
        name        = "blocked-${ip_restriction.key + 1}"
        action      = "Deny"
        ip_address  = ip_restriction.value
        priority    = 1000 + ip_restriction.key
        description = "Reviewed abusive source CIDR"
      }
    }

    application_stack {
      docker_image_name   = "laidbackhr-web:${var.image_tag}"
      docker_registry_url = "https://${azurerm_container_registry.app.login_server}"
    }
  }

  app_settings = {
    WEBSITES_PORT                              = "8080"
    APP_VERSION                                = var.image_tag
    DATABASE_URL                               = local.key_vault_database_reference
    AUTH_SECRET                                = local.key_vault_auth_reference
    GOOGLE_CLIENT_ID                           = local.key_vault_google_id_reference
    GOOGLE_CLIENT_SECRET                       = local.key_vault_google_secret_reference
    AUTH_URL                                   = var.application_base_url
    AUTH_TRUST_HOST                            = "true"
    NEXTAUTH_URL                               = var.application_base_url
    AUTH_COOKIE_DOMAIN                         = ".laidbackhr.cloud"
    BOOTSTRAP_ADMIN_EMAIL                      = var.bootstrap_admin_email
    BOOTSTRAP_ADMIN_NAME                       = var.bootstrap_admin_name
    DATABASE_POOL_MAX                          = "10"
    ANALYTICS_CACHE_TTL_MS                     = "30000"
    SEED_DEMO_DATA                             = "false"
    EMPLOYEE_DOCUMENTS_ACCOUNT_URL             = azurerm_storage_account.employee_documents.primary_blob_endpoint
    EMPLOYEE_DOCUMENTS_CONTAINER               = azurerm_storage_container.employee_documents.name
    AZURE_AI_SEARCH_ENDPOINT                   = local.ai_search_endpoint_reference
    AZURE_AI_SEARCH_API_KEY                    = local.ai_search_key_reference
    AZURE_AI_SEARCH_INDEX                      = var.azure_ai_search_index
    AZURE_OPENAI_ENDPOINT                      = local.azure_openai_endpoint_reference
    AZURE_OPENAI_API_KEY                       = local.azure_openai_key_reference
    AZURE_OPENAI_MODEL                         = var.azure_openai_model
    AZURE_OPENAI_EMBEDDING_ENDPOINT            = local.embedding_endpoint_reference
    AZURE_OPENAI_EMBEDDING_API_KEY             = local.embedding_key_reference
    AZURE_OPENAI_EMBEDDING_MODEL               = "text-embedding-3-small"
    APPLICATIONINSIGHTS_CONNECTION_STRING      = azurerm_application_insights.app.connection_string
    ApplicationInsightsAgent_EXTENSION_VERSION = "~3"
    OTEL_SERVICE_NAME                          = "laidbackhr-web"
    AZURE_SUBSCRIPTION_ID                      = var.subscription_id
    AZURE_RESOURCE_GROUP                       = local.resource_group_name
    AZURE_LOG_ANALYTICS_WORKSPACE_ID           = azurerm_log_analytics_workspace.app.workspace_id
  }
}

resource "azurerm_role_assignment" "web_acr_pull" {
  scope                            = azurerm_container_registry.app.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_linux_web_app.web.identity[0].principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "web_employee_documents" {
  scope                = azurerm_storage_account.employee_documents.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_linux_web_app.web.identity[0].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_app_service_custom_hostname_binding" "employee" {
  count = var.enable_employee_custom_domain ? 1 : 0

  hostname            = trimsuffix(trimprefix(var.employee_portal_url, "https://"), "/")
  app_service_name    = azurerm_linux_web_app.web.name
  resource_group_name = local.resource_group_name
}

resource "azurerm_app_service_managed_certificate" "employee" {
  count = var.enable_employee_custom_domain ? 1 : 0

  custom_hostname_binding_id = azurerm_app_service_custom_hostname_binding.employee[0].id
}

resource "azurerm_app_service_certificate_binding" "employee" {
  count = var.enable_employee_custom_domain ? 1 : 0

  hostname_binding_id = azurerm_app_service_custom_hostname_binding.employee[0].id
  certificate_id      = azurerm_app_service_managed_certificate.employee[0].id
  ssl_state           = "SniEnabled"
}

resource "azurerm_role_assignment" "web_key_vault_secrets" {
  scope                            = azurerm_key_vault.app.id
  role_definition_name             = "Key Vault Secrets User"
  principal_id                     = azurerm_linux_web_app.web.identity[0].principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}
