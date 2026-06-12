export function countryFlagUrl(iso2: string, style = "flat", size = 32): string {
  return `https://flagsapi.com/${iso2.toUpperCase()}/${style}/${size}.png`;
}
