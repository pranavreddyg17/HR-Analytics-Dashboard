export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return
  const { useAzureMonitor: configureAzureMonitor } = await import("@azure/monitor-opentelemetry")
  configureAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: 0.2,
    tracesPerSecond: 0,
    enableLiveMetrics: false,
    enableStandardMetrics: true,
    instrumentationOptions: {
      azureSdk: { enabled: true },
      http: { enabled: true },
      postgreSql: { enabled: true },
      console: { enabled: false },
    },
  })
}
