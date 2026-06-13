export type CountryOption = {
  id: string;
  name: string;
  iso2: string;
  flagUrl: string;
};

export type SessionView = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  totalScore: number;
  currentRoundIndex: number;
  roundCount: number;
  completedRounds: number;
  currentRound: {
    id: string;
    roundNumber: number;
    guesses: Array<{
      id: string;
      countryId: string;
      countryName: string;
      distanceKm: number;
      penalty: number;
      isCorrect: boolean;
      proximityLabel: string;
      targetBearing: number;
      targetDirection: string;
    }>;
    dish: {
      id: string;
      title: string;
      imageUrl: string;
      imageGallery?: string[];
      instructions: string;
      ingredients: string[];
    };
  } | null;
  solvedRounds: Array<{
    id: string;
    roundNumber: number;
    dishTitle: string;
    dishImageUrl: string;
    countryName: string;
    roundScore: number;
    totalPenalty: number;
    guessedCorrectly: boolean;
  }>;
};

export type GuessResponse = {
  session: SessionView;
  guessResult: {
    roundId: string;
    correct: boolean;
    roundEnded: boolean;
    exhausted: boolean;
    distanceKm: number;
    penalty: number;
    scoreDelta: number;
    revealCountry: string | null;
    dishTitle: string;
    dishImageUrl: string;
    proximityLabel: string;
    targetBearing: number;
    targetDirection: string;
  };
};

export type RoomMemberView = {
  id: string;
  name: string;
  slot: "PLAYER_1" | "PLAYER_2";
};

export type RoomMessageView = {
  id: string;
  memberId: string;
  senderName: string;
  senderSlot: "PLAYER_1" | "PLAYER_2";
  text: string;
  replyTo: {
    id: string;
    senderName: string;
    text: string;
  } | null;
  reactions: Array<{
    memberId: string;
    emoji: string;
  }>;
  createdAt: string;
};

export type RoomLaunchResponse = {
  roomCode: string;
  roomStatus: "WAITING_FOR_PLAYER" | "IN_PROGRESS" | "COMPLETED";
  selfMemberId: string;
  selfSlot: "PLAYER_1" | "PLAYER_2";
  selfName: string;
  members: RoomMemberView[];
  messages: RoomMessageView[];
  session: SessionView;
};

export type RoomGuessResponse = {
  room: RoomLaunchResponse;
  session: SessionView;
  guessResult: GuessResponse["guessResult"];
};
