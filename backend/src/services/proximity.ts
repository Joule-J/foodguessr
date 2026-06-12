import type { CountryRecord } from "../domain";
import { areBorderingCountries } from "../data/country-borders";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function proximityLabel(input: {
  distanceKm: number;
  guessedCountry: Pick<CountryRecord, "alpha3">;
  targetCountry: Pick<CountryRecord, "alpha3">;
}) {
  if (areBorderingCountries(input.guessedCountry.alpha3, input.targetCountry.alpha3)) {
    return "Border";
  }

  if (input.distanceKm <= 2200) {
    return "Hot";
  }

  if (input.distanceKm <= 4200) {
    return "Warm";
  }

  if (input.distanceKm <= 6500) {
    return "Cool";
  }

  return "Ice Cold";
}

export function bearingDegrees(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
) {
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);
  const longitudeDeltaRadians = toRadians(toLongitude - fromLongitude);

  const y = Math.sin(longitudeDeltaRadians) * Math.cos(toLatitudeRadians);
  const x =
    Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians) -
    Math.sin(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.cos(longitudeDeltaRadians);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function bearingDirection(bearing: number) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalizedIndex = Math.round(bearing / 45) % directions.length;
  return directions[normalizedIndex] ?? "N";
}
