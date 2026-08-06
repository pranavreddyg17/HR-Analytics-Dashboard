variable "subscription_id" {
  description = "Azure subscription that contains the existing Laidback.ai resource group."
  type        = string
}

variable "resource_group_name" {
  description = "Existing resource group that owns every LaidbackHR Azure resource."
  type        = string
  default     = "Laidback.ai"

  validation {
    condition     = var.resource_group_name == "Laidback.ai"
    error_message = "All LaidbackHR resources must remain in the existing Laidback.ai resource group."
  }
}

variable "location" {
  description = "Primary Azure region for the application."
  type        = string
  default     = "westus2"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "production"
}

variable "app_service_sku" {
  description = "Linux App Service Plan SKU. B1 is the cost-controlled starting tier."
  type        = string
  default     = "B1"
}

variable "postgres_sku" {
  description = "Azure PostgreSQL Flexible Server compute SKU."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "image_tag" {
  description = "Immutable container image tag produced by Azure Pipelines."
  type        = string
  default     = "bootstrap"
}

variable "deployment_principal_id" {
  description = "Object ID of the Azure DevOps deployment identity used for stable runtime role assignments."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.deployment_principal_id))
    error_message = "deployment_principal_id must be an Entra object ID in UUID form."
  }
}

variable "tfstate_storage_account_name" {
  description = "Storage account containing the remote Terraform state."
  type        = string
  default     = "laidbackhrtf7981312c"
}

variable "bootstrap_principal_id" {
  description = "Object ID of the operator performing the first apply. Remove after bootstrap to revoke temporary Key Vault secret access."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.bootstrap_principal_id == null || can(regex("^[0-9a-fA-F-]{36}$", var.bootstrap_principal_id))
    error_message = "bootstrap_principal_id must be null or an Entra object ID in UUID form."
  }
}
