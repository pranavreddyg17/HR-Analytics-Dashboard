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
  tags                          = local.common_tags
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
  tags                            = local.common_tags

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
  tags                = local.common_tags
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = "laidbackhr-${var.environment}-logs"
  resource_group_name = local.resource_group_name
  location            = local.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

resource "azurerm_application_insights" "app" {
  name                = "laidbackhr-${var.environment}-insights"
  resource_group_name = local.resource_group_name
  location            = local.location
  workspace_id        = azurerm_log_analytics_workspace.app.id
  application_type    = "web"
  tags                = local.common_tags
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
  tags                          = local.common_tags

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
  tags                       = local.common_tags
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
  model_name                        = "laidbackhr-${random_string.suffix.result}-model"
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

resource "azurerm_linux_web_app" "model" {
  name                                           = local.model_name
  resource_group_name                            = local.resource_group_name
  location                                       = local.location
  service_plan_id                                = azurerm_service_plan.app.id
  https_only                                     = true
  public_network_access_enabled                  = true
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false
  tags                                           = local.common_tags

  identity { type = "SystemAssigned" }

  site_config {
    always_on                               = false
    container_registry_use_managed_identity = true
    minimum_tls_version                     = "1.2"
    http2_enabled                           = true

    application_stack {
      docker_image_name   = "laidbackhr-model:${var.image_tag}"
      docker_registry_url = "https://${azurerm_container_registry.app.login_server}"
    }
  }

  app_settings = {
    WEBSITES_PORT                         = "8000"
    ALLOWED_ORIGINS                       = var.application_base_url
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.app.connection_string
  }

  lifecycle {
    ignore_changes = [site_config[0].application_stack[0].docker_image_name]
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
  tags                                           = local.common_tags

  identity { type = "SystemAssigned" }

  site_config {
    always_on                               = true
    health_check_path                       = "/api/v1/ready"
    health_check_eviction_time_in_min       = 5
    container_registry_use_managed_identity = true
    minimum_tls_version                     = "1.2"
    http2_enabled                           = true

    application_stack {
      docker_image_name   = "laidbackhr-web:${var.image_tag}"
      docker_registry_url = "https://${azurerm_container_registry.app.login_server}"
    }
  }

  app_settings = {
    WEBSITES_PORT                         = "8080"
    DATABASE_URL                          = local.key_vault_database_reference
    AUTH_SECRET                           = local.key_vault_auth_reference
    GOOGLE_CLIENT_ID                      = local.key_vault_google_id_reference
    GOOGLE_CLIENT_SECRET                  = local.key_vault_google_secret_reference
    AUTH_URL                              = var.application_base_url
    AUTH_TRUST_HOST                       = "true"
    NEXTAUTH_URL                          = var.application_base_url
    AUTH_COOKIE_DOMAIN                    = ".laidbackhr.cloud"
    DATABASE_POOL_MAX                     = "10"
    SEED_DEMO_DATA                        = "false"
    EMPLOYEE_DOCUMENTS_ACCOUNT_URL        = azurerm_storage_account.employee_documents.primary_blob_endpoint
    EMPLOYEE_DOCUMENTS_CONTAINER          = azurerm_storage_container.employee_documents.name
    AZURE_AI_SEARCH_ENDPOINT              = local.ai_search_endpoint_reference
    AZURE_AI_SEARCH_API_KEY               = local.ai_search_key_reference
    AZURE_AI_SEARCH_INDEX                 = var.azure_ai_search_index
    AZURE_OPENAI_ENDPOINT                 = local.azure_openai_endpoint_reference
    AZURE_OPENAI_API_KEY                  = local.azure_openai_key_reference
    AZURE_OPENAI_MODEL                    = var.azure_openai_model
    AZURE_OPENAI_EMBEDDING_ENDPOINT       = local.embedding_endpoint_reference
    AZURE_OPENAI_EMBEDDING_API_KEY        = local.embedding_key_reference
    AZURE_OPENAI_EMBEDDING_MODEL          = "text-embedding-3-small"
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.app.connection_string
  }
}

resource "azurerm_role_assignment" "web_acr_pull" {
  scope                            = azurerm_container_registry.app.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_linux_web_app.web.identity[0].principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "model_acr_pull" {
  scope                            = azurerm_container_registry.app.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_linux_web_app.model.identity[0].principal_id
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
