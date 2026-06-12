import type { CountryOption, GuessResponse, SessionView } from "./types";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? "Request failed.");
  }

  return (await response.json()) as T;
}

export async function fetchCountries(): Promise<CountryOption[]> {
  const response = await fetch(`${backendUrl}/api/countries`, {
    cache: "no-store"
  });
  return parseResponse<CountryOption[]>(response);
}

export async function createSession(): Promise<SessionView> {
  const response = await fetch(`${backendUrl}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  return parseResponse<SessionView>(response);
}

export async function fetchSession(sessionId: string): Promise<SessionView> {
  const response = await fetch(`${backendUrl}/api/sessions/${sessionId}`, {
    cache: "no-store"
  });

  return parseResponse<SessionView>(response);
}

export async function submitGuess(
  sessionId: string,
  countryId: string
): Promise<GuessResponse> {
  const response = await fetch(`${backendUrl}/api/sessions/${sessionId}/guesses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      countryId
    })
  });

  return parseResponse<GuessResponse>(response);
}
