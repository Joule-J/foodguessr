import type {
  CountryOption,
  RoomGuessResponse,
  RoomLaunchResponse,
  SessionView
} from "./types";

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

export async function createRoom(name: string): Promise<RoomLaunchResponse> {
  const response = await fetch(`${backendUrl}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name })
  });

  return parseResponse<RoomLaunchResponse>(response);
}

export async function joinRoom(code: string, name: string): Promise<RoomLaunchResponse> {
  const response = await fetch(`${backendUrl}/api/rooms/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code, name })
  });

  return parseResponse<RoomLaunchResponse>(response);
}

export async function fetchRoomState(
  code: string,
  memberId: string
): Promise<RoomLaunchResponse> {
  const response = await fetch(
    `${backendUrl}/api/rooms/${code}?memberId=${encodeURIComponent(memberId)}`,
    {
      cache: "no-store"
    }
  );

  return parseResponse<RoomLaunchResponse>(response);
}

export async function sendRoomMessage(
  code: string,
  memberId: string,
  text: string,
  replyToMessageId?: string
): Promise<RoomLaunchResponse> {
  const response = await fetch(`${backendUrl}/api/rooms/${code}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ memberId, text, replyToMessageId })
  });

  return parseResponse<RoomLaunchResponse>(response);
}

export async function reactToRoomMessage(
  code: string,
  messageId: string,
  memberId: string,
  emoji: string
): Promise<RoomLaunchResponse> {
  const response = await fetch(`${backendUrl}/api/rooms/${code}/messages/${messageId}/reactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ memberId, emoji })
  });

  return parseResponse<RoomLaunchResponse>(response);
}

export async function submitGuess(
  roomCode: string,
  memberId: string,
  countryId: string
): Promise<RoomGuessResponse> {
  const response = await fetch(`${backendUrl}/api/rooms/${roomCode}/guesses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      memberId,
      countryId
    })
  });

  return parseResponse<RoomGuessResponse>(response);
}

export async function restartRoom(
  code: string,
  memberId: string
): Promise<RoomLaunchResponse> {
  const response = await fetch(`${backendUrl}/api/rooms/${code}/restart`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ memberId })
  });

  return parseResponse<RoomLaunchResponse>(response);
}
