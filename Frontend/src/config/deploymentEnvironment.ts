export const STAGING_DEPLOYMENT_ENVIRONMENT = 'staging';
export const TEST_PRODUCTION_HOSTNAME = 'thisistestfor.bandeja.me';

export function isStagingDeploymentEnvironment(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.trim().toLowerCase() === STAGING_DEPLOYMENT_ENVIRONMENT
  );
}

export function isCurrentStagingDeployment(): boolean {
  return isStagingDeploymentEnvironment(import.meta.env.VITE_DEPLOYMENT_ENV);
}

export function isTestProductionHostname(hostname: string): boolean {
  return hostname.trim().toLowerCase() === TEST_PRODUCTION_HOSTNAME;
}
