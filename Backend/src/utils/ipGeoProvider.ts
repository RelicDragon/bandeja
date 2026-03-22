export enum IpGeoProvider {
  IpapiCo = 'ipapi_co',
  IpwhoisApp = 'ipwhois_app',
  IpinfoIo = 'ipinfo_io',
}

/** Default order; round-robin rotates which entry is tried first per cache-miss request. */
export const IP_GEO_PROVIDER_CHAIN: readonly IpGeoProvider[] = [
  IpGeoProvider.IpapiCo,
  IpGeoProvider.IpwhoisApp,
  IpGeoProvider.IpinfoIo,
];
