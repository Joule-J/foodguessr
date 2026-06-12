export const countryBordersByAlpha3: Record<string, string[]> = {
  USA: ["CAN", "MEX"],
  GBR: ["IRL"],
  CAN: ["USA"],
  CHN: ["AFG", "BTN", "MMR", "HKG", "IND", "KAZ", "NPL", "PRK", "KGZ", "LAO", "MAC", "MNG", "PAK", "RUS", "TJK", "VNM"],
  HRV: ["BIH", "HUN", "MNE", "SRB", "SVN"],
  NLD: ["BEL", "DEU"],
  EGY: ["ISR", "LBY", "PSE", "SDN"],
  PHL: [],
  FRA: ["AND", "BEL", "DEU", "ITA", "LUX", "MCO", "ESP", "CHE"],
  GRC: ["ALB", "BGR", "TUR", "MKD"],
  IND: ["BGD", "BTN", "MMR", "CHN", "NPL", "PAK"],
  IRL: ["GBR"],
  ITA: ["AUT", "FRA", "SMR", "SVN", "CHE", "VAT"],
  JAM: [],
  JPN: [],
  KEN: ["ETH", "SOM", "SSD", "TZA", "UGA"],
  MYS: ["BRN", "IDN", "THA"],
  MEX: ["BLZ", "GTM", "USA"],
  MAR: ["DZA", "ESH", "ESP"],
  POL: ["BLR", "CZE", "DEU", "LTU", "RUS", "SVK", "UKR"],
  PRT: ["ESP"],
  RUS: ["AZE", "BLR", "CHN", "EST", "FIN", "GEO", "KAZ", "PRK", "LVA", "LTU", "MNG", "NOR", "POL", "UKR"],
  ESP: ["AND", "FRA", "GIB", "PRT", "MAR"],
  THA: ["MMR", "KHM", "LAO", "MYS"],
  TUN: ["DZA", "LBY"],
  TUR: ["ARM", "AZE", "BGR", "GEO", "GRC", "IRN", "IRQ", "SYR"],
  UKR: ["BLR", "HUN", "MDA", "POL", "ROU", "RUS", "SVK"],
  URY: ["ARG", "BRA"],
  VNM: ["KHM", "CHN", "LAO"]
};

export function areBorderingCountries(guessedAlpha3: string, targetAlpha3: string) {
  return countryBordersByAlpha3[targetAlpha3]?.includes(guessedAlpha3) ?? false;
}
