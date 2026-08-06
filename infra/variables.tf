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
