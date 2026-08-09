output "resource_group" {
  description = "Existing resource group used by the application."
  value = {
    id       = data.azurerm_resource_group.laidback.id
    name     = local.resource_group_name
    location = local.location
  }
}

output "deployment_endpoints" {
  description = "Azure endpoints created for application deployment."
  value = {
    web_url          = "https://${azurerm_linux_web_app.web.default_hostname}"
    registry         = azurerm_container_registry.app.login_server
    postgres_server  = azurerm_postgresql_flexible_server.app.fqdn
    key_vault_uri    = azurerm_key_vault.app.vault_uri
    document_storage = azurerm_storage_account.employee_documents.primary_blob_endpoint
    employee_portal  = var.employee_portal_url
  }
}
