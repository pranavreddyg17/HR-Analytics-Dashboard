data "azurerm_resource_group" "laidback" {
  name = var.resource_group_name
}

data "azurerm_storage_account" "terraform_state" {
  name                = var.tfstate_storage_account_name
  resource_group_name = var.resource_group_name
}

data "azurerm_client_config" "current" {}

locals {
  resource_group_name = data.azurerm_resource_group.laidback.name
  location            = data.azurerm_resource_group.laidback.location
  common_tags = {
    application = "laidbackhr"
    environment = var.environment
    managed_by  = "terraform"
    workload    = "hr-analytics-platform"
  }
}
