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
