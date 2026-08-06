output "resource_group" {
  description = "Existing resource group used by the application."
  value = {
    id       = data.azurerm_resource_group.laidback.id
    name     = local.resource_group_name
    location = local.location
  }
}
