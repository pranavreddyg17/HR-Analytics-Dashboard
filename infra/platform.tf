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

resource "azurerm_role_assignment" "terraform_key_vault_secrets" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_key_vault_secret" "database_url" {
  name         = "database-url"
  value        = "postgresql://laidbackhradmin:${urlencode(random_password.postgres.result)}@${azurerm_postgresql_flexible_server.app.fqdn}:5432/${azurerm_postgresql_flexible_server_database.app.name}?sslmode=require"
  key_vault_id = azurerm_key_vault.app.id
  depends_on   = [azurerm_role_assignment.terraform_key_vault_secrets]
}

resource "azurerm_key_vault_secret" "auth_secret" {
  name         = "auth-secret"
  value        = random_password.auth_secret.result
  key_vault_id = azurerm_key_vault.app.id
  depends_on   = [azurerm_role_assignment.terraform_key_vault_secrets]
}

locals {
  web_name                     = "laidbackhr-${random_string.suffix.result}-web"
  model_name                   = "laidbackhr-${random_string.suffix.result}-model"
  key_vault_database_reference = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.database_url.versionless_id})"
  key_vault_auth_reference     = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.auth_secret.versionless_id})"
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
    health_check_path                       = "/api/v1/health"
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
    AUTH_TRUST_HOST                       = "true"
    DATABASE_POOL_MAX                     = "10"
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.app.connection_string
    MODEL_API_URL                         = "https://${local.model_name}.azurewebsites.net"
  }
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
    always_on                               = true
    health_check_path                       = "/health"
    health_check_eviction_time_in_min       = 5
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
    ALLOWED_ORIGINS                       = "https://${local.web_name}.azurewebsites.net"
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.app.connection_string
  }
}

resource "azurerm_role_assignment" "web_acr_pull" {
  scope                = azurerm_container_registry.app.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.web.identity[0].principal_id
}

resource "azurerm_role_assignment" "model_acr_pull" {
  scope                = azurerm_container_registry.app.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.model.identity[0].principal_id
}

resource "azurerm_role_assignment" "web_key_vault_secrets" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.web.identity[0].principal_id
}
