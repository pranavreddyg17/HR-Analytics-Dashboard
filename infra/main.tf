data "azurerm_resource_group" "laidback" {
  name = var.resource_group_name
}

locals {
  resource_group_name = data.azurerm_resource_group.laidback.name
  location            = data.azurerm_resource_group.laidback.location
  common_tags = {
    application = "laidbackhr"
    environment = "production"
    managed_by  = "terraform"
  }
}
