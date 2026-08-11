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

variable "virtual_network_cidr" {
  description = "Address space reserved for LaidbackHR application networking."
  type        = string
  default     = "10.42.0.0/16"
}

variable "app_integration_subnet_cidr" {
  description = "Dedicated App Service regional VNet integration subnet."
  type        = string
  default     = "10.42.1.0/26"
}

variable "private_endpoint_subnet_cidr" {
  description = "Reserved subnet for future private endpoints; adding an endpoint remains an explicit cost and migration decision."
  type        = string
  default     = "10.42.2.0/27"
}

variable "blocked_ip_cidrs" {
  description = "Explicitly reviewed hostile or abusive source CIDRs denied at App Service ingress. Keep threat intelligence outside Terraform and update this list through change control."
  type        = list(string)
  default     = []
}

variable "image_tag" {
  description = "Immutable container image tag produced by GitHub Actions."
  type        = string
  default     = "bootstrap"
}

variable "application_base_url" {
  description = "Canonical public origin used by Auth.js and Google OAuth."
  type        = string
  default     = "https://www.laidbackhr.cloud"
}

variable "employee_portal_url" {
  description = "Public employee self-service origin."
  type        = string
  default     = "https://employee.laidbackhr.cloud"
}

variable "bootstrap_admin_email" {
  description = "Initial workspace administrator. Existing role changes remain database-managed."
  type        = string
  default     = "pranavreddyg17@gmail.com"
}

variable "bootstrap_admin_name" {
  description = "Display name for the initial workspace administrator."
  type        = string
  default     = "Pranav Reddy"
}

variable "enable_employee_custom_domain" {
  description = "Create the employee.laidbackhr.cloud App Service binding after its DNS CNAME and asuid TXT records exist."
  type        = bool
  default     = false
}

variable "azure_ai_search_index" {
  description = "Azure AI Search index used by grounded HR retrieval."
  type        = string
  default     = "laidbackhr-knowledge-v1"
}

variable "azure_openai_model" {
  description = "Existing Azure OpenAI chat deployment name. Leave blank until a deployment is assigned."
  type        = string
  default     = ""
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
