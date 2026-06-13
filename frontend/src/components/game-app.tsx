"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData
} from "emoji-picker-react";
import type { Socket } from "socket.io-client";

import {
  createRoom,
  fetchCountries,
  fetchRoomState,
  joinRoom,
  reactToRoomMessage,
  restartRoom,
  sendRoomMessage,
  submitGuess
} from "@/lib/api";
import { createRoomSocket } from "@/lib/socket";
import type {
  CountryOption,
  GuessResponse,
  RoomLaunchResponse,
  RoomMessageView,
  SessionView
} from "@/lib/types";

import styles from "./game-app.module.css";

const historySlotCount = 5;
const foodImageFallback = "/food-placeholder.svg";
const landingPlates = [
  {
    imageUrl: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
    title: "Dessert Table"
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=1200&q=80",
    title: "Pastry Plate"
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=1200&q=80",
    title: "Sweet Treats"
  }
] as const;
const driftingPetals = [
  { left: "3%", delay: "0s", duration: "18s", size: "34px", sway: "-18px", opacity: 0.62 },
  { left: "11%", delay: "-4s", duration: "22s", size: "26px", sway: "14px", opacity: 0.5 },
  { left: "19%", delay: "-9s", duration: "17s", size: "32px", sway: "-12px", opacity: 0.58 },
  { left: "28%", delay: "-2s", duration: "24s", size: "24px", sway: "10px", opacity: 0.42 },
  { left: "39%", delay: "-6s", duration: "20s", size: "30px", sway: "-16px", opacity: 0.56 },
  { left: "48%", delay: "-11s", duration: "23s", size: "36px", sway: "12px", opacity: 0.48 },
  { left: "58%", delay: "-8s", duration: "19s", size: "28px", sway: "-20px", opacity: 0.52 },
  { left: "67%", delay: "-13s", duration: "22s", size: "38px", sway: "11px", opacity: 0.46 },
  { left: "76%", delay: "-5s", duration: "18s", size: "27px", sway: "-14px", opacity: 0.54 },
  { left: "84%", delay: "-1s", duration: "25s", size: "33px", sway: "13px", opacity: 0.44 },
  { left: "91%", delay: "-10s", duration: "21s", size: "25px", sway: "-11px", opacity: 0.4 }
] as const;
const flowerAssets = [
  "/flowers/flower.png",
  "/flowers/flower-1.png",
  "/flowers/flower-2.png",
  "/flowers/mexican-aster.png",
  "/flowers/cherry-blossom.png",
  "/flowers/tulips.png",
  "/flowers/sakura.png"
] as const;
const loveReactionEmojis = ["❤️", "🫠", "🤔", "😢", "😘"] as const;
const landingFlowerFrames = [
  { left: "4%", top: "6%", size: "72px", rotate: "-14deg", opacity: 0.28 },
  { right: "5%", top: "10%", size: "82px", rotate: "12deg", opacity: 0.24 },
  { left: "8%", bottom: "9%", size: "88px", rotate: "-9deg", opacity: 0.22 },
  { right: "11%", bottom: "14%", size: "70px", rotate: "16deg", opacity: 0.2 },
  { left: "44%", top: "16%", size: "54px", rotate: "-7deg", opacity: 0.18 }
] as const;
type RoomSocketPayload = RoomLaunchResponse & {
  actorMemberId?: string;
  guessResult?: GuessResponse["guessResult"];
};

function proximityToneClass(label: string, stylesMap: Record<string, string>) {
  switch (label) {
    case "Border":
      return stylesMap.proximityBorder;
    case "Hot":
      return stylesMap.proximityHot;
    case "Warm":
      return stylesMap.proximityWarm;
    case "Cool":
      return stylesMap.proximityCool;
    default:
      return stylesMap.proximityIceCold;
  }
}

function compassQuadrant(bearing: number) {
  if (bearing >= 0 && bearing < 90) {
    return { rotation: 45 };
  }

  if (bearing >= 90 && bearing < 180) {
    return { rotation: 135 };
  }

  if (bearing >= 180 && bearing < 270) {
    return { rotation: 225 };
  }

  return { rotation: 315 };
}

function filterCountries(query: string, countries: CountryOption[]) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return countries.slice(0, 12);
  }

  return countries
    .filter((country) => country.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 12);
}

function isEmojiOnlyMessage(text: string) {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return false;
  }

  const emojiPattern =
    /^(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u;
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmedText);

  return Array.from(segments).every(({ segment }) => {
    return /^\s+$/u.test(segment) || emojiPattern.test(segment);
  });
}

function buildSolvedRoundResult(
  round: SessionView["solvedRounds"][number]
): GuessResponse["guessResult"] {
  return {
    roundId: round.id,
    correct: round.guessedCorrectly,
    roundEnded: true,
    exhausted: !round.guessedCorrectly,
    distanceKm: 0,
    penalty: round.totalPenalty,
    scoreDelta: round.roundScore,
    revealCountry: round.countryName,
    dishTitle: round.dishTitle,
    dishImageUrl: round.dishImageUrl,
    proximityLabel: round.guessedCorrectly ? "Border" : "Ice Cold",
    targetBearing: 0,
    targetDirection: "Here"
  };
}

export function GameApp() {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [room, setRoom] = useState<RoomLaunchResponse | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<GuessResponse["guessResult"] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [landingIndex, setLandingIndex] = useState(0);
  const [isJoinExpanded, setIsJoinExpanded] = useState(false);
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const [isReactionEmojiPickerOpen, setIsReactionEmojiPickerOpen] = useState(false);
  const [isComposerEmojiPanelOpen, setIsComposerEmojiPanelOpen] = useState(false);
  const [isComposerEmojiPickerOpen, setIsComposerEmojiPickerOpen] = useState(false);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<RoomMessageView | null>(null);
  const [activeMessageActionId, setActiveMessageActionId] = useState<string | null>(null);
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState<string | null>(null);
  const chatScrollerRef = useRef<HTMLDivElement | null>(null);
  const reactionPickerRef = useRef<HTMLDivElement | null>(null);
  const reactionEmojiPickerRef = useRef<HTMLDivElement | null>(null);
  const composerEmojiRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const announcedRoundIdRef = useRef<string | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const previousSolvedCountRef = useRef(0);
  const fallingFlowers = useMemo(
    () =>
      driftingPetals.map((petal, index) => ({
        ...petal,
        imageUrl: flowerAssets[(index * 3 + 2) % flowerAssets.length]
      })),
    []
  );
  const landingDecorFlowers = useMemo(
    () =>
      landingFlowerFrames.map((flower, index) => ({
        ...flower,
        imageUrl: flowerAssets[(index * 2 + 1) % flowerAssets.length]
      })),
    []
  );
  function applyRoomSnapshot(snapshot: RoomLaunchResponse) {
    setRoom((currentRoom) => {
      if (!currentRoom) {
        return snapshot;
      }

      return {
        ...snapshot,
        selfMemberId: currentRoom.selfMemberId,
        selfSlot: currentRoom.selfSlot,
        selfName: currentRoom.selfName
      };
    });
  }

  function rememberRoundResult(result: GuessResponse["guessResult"] | null) {
    setLastResult(result);

    if (result?.roundEnded) {
      announcedRoundIdRef.current = result.roundId;
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const loadedCountries = await fetchCountries();
        setCountries(loadedCountries);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load countries.");
      }
    })();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLandingIndex((currentIndex) => (currentIndex + 1) % landingPlates.length);
    }, 3600);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const node = chatScrollerRef.current;

    if (!node) {
      return;
    }

    node.scrollTo({
      top: node.scrollHeight,
      behavior: "smooth"
    });
  }, [room?.messages]);

  useEffect(() => {
    if (!room) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = createRoomSocket();
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit("room:subscribe", {
        roomCode: room.roomCode,
        memberId: room.selfMemberId
      });
    };

    const handleRoomUpdated = (payload: RoomLaunchResponse) => {
      applyRoomSnapshot(payload);
    };

    const handleRoomEvent = (payload: RoomSocketPayload) => {
      applyRoomSnapshot(payload);

      if (payload.guessResult?.roundEnded) {
        rememberRoundResult(payload.guessResult);
      }
    };

    socket.on("connect", subscribe);
    socket.on("room:updated", handleRoomUpdated);
    socket.on("room:member_joined", handleRoomUpdated);
    socket.on("room:message_added", handleRoomUpdated);
    socket.on("room:guess_submitted", handleRoomEvent);
    socket.on("room:round_solved", handleRoomEvent);
    socket.on("room:completed", handleRoomEvent);
    socket.on("room:restarted", handleRoomUpdated);
    socket.on("room:error", (payload: { error?: string }) => {
      setError(payload.error ?? "Room connection failed.");
    });

    if (socket.connected) {
      subscribe();
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [room?.roomCode, room?.selfMemberId]);

  useEffect(() => {
    if (
      !activeMessageActionId &&
      !activeReactionPickerMessageId &&
      !isComposerEmojiPanelOpen
    ) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        reactionPickerRef.current?.contains(event.target as Node) ||
        reactionEmojiPickerRef.current?.contains(event.target as Node) ||
        composerEmojiRef.current?.contains(event.target as Node)
      ) {
        return;
      }

      setActiveMessageActionId(null);
      setActiveReactionPickerMessageId(null);
      setIsReactionEmojiPickerOpen(false);
      setIsComposerEmojiPanelOpen(false);
      setIsComposerEmojiPickerOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [activeMessageActionId, activeReactionPickerMessageId, isComposerEmojiPanelOpen]);

  useEffect(() => {
    if (!lastResult?.roundEnded) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLastResult(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [lastResult]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchRoomState(room.roomCode, room.selfMemberId)
        .then(applyRoomSnapshot)
        .catch(() => {
          // Socket events remain the primary realtime path.
        });
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [room?.roomCode, room?.selfMemberId]);

  const filteredCountries = useMemo(
    () => filterCountries(query, countries),
    [query, countries]
  );
  const countriesById = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries]
  );
  const session = room?.session ?? null;
  const currentRound = session?.currentRound ?? null;

  useEffect(() => {
    if (!session) {
      previousSessionIdRef.current = null;
      previousSolvedCountRef.current = 0;
      announcedRoundIdRef.current = null;
      return;
    }

    const latestSolvedRound = session.solvedRounds.at(-1) ?? null;

    if (previousSessionIdRef.current !== session.id) {
      previousSessionIdRef.current = session.id;
      previousSolvedCountRef.current = session.solvedRounds.length;
      announcedRoundIdRef.current = latestSolvedRound?.id ?? null;
      return;
    }

    const solvedCountIncreased = session.solvedRounds.length > previousSolvedCountRef.current;
    const latestSolvedRoundIsNew =
      latestSolvedRound && latestSolvedRound.id !== announcedRoundIdRef.current;

    if (solvedCountIncreased && latestSolvedRoundIsNew) {
      rememberRoundResult(buildSolvedRoundResult(latestSolvedRound));
    }

    previousSolvedCountRef.current = session.solvedRounds.length;
  }, [session]);

  const wrongGuessCount = useMemo(
    () => currentRound?.guesses.filter((guess) => !guess.isCorrect).length ?? 0,
    [currentRound]
  );
  const canGuess =
    Boolean(
      room &&
        room.roomStatus === "IN_PROGRESS" &&
        session?.status === "IN_PROGRESS" &&
        currentRound
    );
  const roomMessages = room?.messages ?? [];
  const historySlots = useMemo(() => {
    const guesses = [...(currentRound?.guesses ?? [])].reverse();
    return Array.from({ length: historySlotCount }, (_, index) => guesses[index] ?? null);
  }, [currentRound]);

  async function handleCreateRoom() {
    const trimmedName = playerName.trim();

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

      setError(null);
    rememberRoundResult(null);
    setIsBusy(true);

    try {
      const launch = await createRoom(trimmedName);
      setRoom(launch);
      setQuery("");
      setJoinCode("");
      setIsJoinExpanded(false);
      setIsCountryMenuOpen(false);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to create room.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleJoinRoom() {
    const normalizedCode = joinCode.trim().toUpperCase();
    const trimmedName = playerName.trim();

    if (!normalizedCode) {
      setError("Room code is required.");
      return;
    }

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

      setError(null);
    rememberRoundResult(null);
    setIsBusy(true);

    try {
      const launch = await joinRoom(normalizedCode, trimmedName);
      setRoom(launch);
      setQuery("");
      setIsJoinExpanded(false);
      setIsCountryMenuOpen(false);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Failed to join room.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGuess(countryId: string) {
    if (!room || !canGuess) {
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      const result = await submitGuess(room.roomCode, room.selfMemberId, countryId);
      applyRoomSnapshot(result.room);
      rememberRoundResult(result.guessResult.roundEnded ? result.guessResult : null);
      setQuery("");
      setIsCountryMenuOpen(false);
    } catch (guessError) {
      setError(guessError instanceof Error ? guessError.message : "Failed to submit guess.");
    } finally {
      setIsBusy(false);
    }
  }

  async function sendChatText(text: string, clearDraft = false) {
    const trimmedText = text.trim();

    if (!trimmedText || !room) {
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      const snapshot = await sendRoomMessage(
        room.roomCode,
        room.selfMemberId,
        trimmedText,
        replyTarget?.id
      );
      applyRoomSnapshot(snapshot);
      setReplyTarget(null);

      if (clearDraft) {
        setChatDraft("");
      }
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "Failed to send message.");
    } finally {
      setIsBusy(false);
    }
  }

  async function sendChatMessage() {
    await sendChatText(chatDraft, true);
  }

  async function handleMessageReaction(messageId: string, emoji: string) {
    if (!room || reactingMessageId) {
      return;
    }

    setError(null);
    setReactingMessageId(messageId);

    try {
      const snapshot = await reactToRoomMessage(room.roomCode, messageId, room.selfMemberId, emoji);
      applyRoomSnapshot(snapshot);
      setActiveReactionPickerMessageId(null);
      setActiveMessageActionId(null);
      setIsReactionEmojiPickerOpen(false);
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : "Failed to react to message.");
    } finally {
      setReactingMessageId(null);
    }
  }

  function handleComposerEmojiClick(emojiData: EmojiClickData) {
    setChatDraft((currentDraft) => `${currentDraft}${emojiData.emoji}`);
  }

  function handleReactionEmojiClick(emojiData: EmojiClickData) {
    if (activeReactionPickerMessageId) {
      void handleMessageReaction(activeReactionPickerMessageId, emojiData.emoji);
    }
  }

  async function handlePlayAgain() {
    if (!room || room.roomStatus !== "COMPLETED") {
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      const snapshot = await restartRoom(room.roomCode, room.selfMemberId);
      applyRoomSnapshot(snapshot);
      rememberRoundResult(null);
      setQuery("");
      setChatDraft("");
      setIsCountryMenuOpen(false);
    } catch (restartError) {
      setError(restartError instanceof Error ? restartError.message : "Failed to restart room.");
    } finally {
      setIsBusy(false);
    }
  }

  function leaveToLanding() {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setRoom(null);
    setJoinCode("");
    setQuery("");
    rememberRoundResult(null);
    setError(null);
    setChatDraft("");
    setIsJoinExpanded(false);
    setIsCountryMenuOpen(false);
    setIsReactionEmojiPickerOpen(false);
    setIsComposerEmojiPanelOpen(false);
    setIsComposerEmojiPickerOpen(false);
    setReactingMessageId(null);
    setReplyTarget(null);
    setActiveMessageActionId(null);
    setActiveReactionPickerMessageId(null);
  }

  return (
    <main className={styles.shell}>
      <div className={styles.loveBackdrop} aria-hidden="true">
        <div className={styles.loveGlowLeft} />
        <div className={styles.loveGlowRight} />
        {fallingFlowers.map((petal, index) => (
          <span
            key={`${petal.left}-${index}`}
            className={styles.fallingPetal}
            style={
              {
                left: petal.left,
                animationDelay: petal.delay,
                animationDuration: petal.duration,
                width: petal.size,
                height: petal.size,
                opacity: petal.opacity,
                "--petal-sway": petal.sway,
                "--flower-image": `url("${petal.imageUrl}")`
              } as CSSProperties
            }
          />
        ))}
      </div>
      {room && session && (
        <header className={styles.header}>
          <div className={styles.headerSide}>
            <button
              type="button"
              className={styles.exitButton}
              onClick={leaveToLanding}
              aria-label="Leave room"
              title="Leave room"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
              </svg>
            </button>
          </div>
          <div className={styles.headerCenter}>
            <p className={styles.kicker}>Begùme</p>
          </div>
          <div className={styles.scoreDock}>
            <div className={styles.scoreCard}>
              <span className={styles.metaLabel}>Room</span>
              <strong>{room.roomCode}</strong>
            </div>
            <div className={styles.scoreCard}>
              <span className={styles.metaLabel}>Score</span>
              <strong>{session.totalScore}</strong>
            </div>
            <div className={styles.scoreCard}>
              <span className={styles.metaLabel}>Round</span>
              <strong>
                {Math.min(session.currentRoundIndex + 1, session.roundCount)} / {session.roundCount}
              </strong>
            </div>
          </div>
        </header>
      )}

      {!room && (
        <section className={styles.emptyState}>
          <div className={styles.landingShell}>
            <div className={styles.landingVisual}>
              <div className={styles.landingDecorLayer} aria-hidden="true">
                {landingDecorFlowers.map((flower, index) => (
                  <img
                    key={`landing-visual-${index}`}
                    src={flower.imageUrl}
                    alt=""
                    className={styles.decorFlower}
                    style={
                      {
                        left: "left" in flower ? flower.left : undefined,
                        right: "right" in flower ? flower.right : undefined,
                        top: "top" in flower ? flower.top : undefined,
                        bottom: "bottom" in flower ? flower.bottom : undefined,
                        width: flower.size,
                        height: flower.size,
                        opacity: flower.opacity,
                        transform: `rotate(${flower.rotate})`
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              {landingPlates.map((plate, index) => (
                <img
                  key={plate.title}
                  src={plate.imageUrl}
                  alt={plate.title}
                  className={index === landingIndex ? styles.landingImageActive : styles.landingImage}
                />
              ))}
              <div className={styles.landingDots}>
                {landingPlates.map((plate, index) => (
                  <button
                    key={plate.title}
                    type="button"
                    className={index === landingIndex ? styles.landingDotActive : styles.landingDot}
                    onClick={() => setLandingIndex(index)}
                    aria-label={`Show ${plate.title}`}
                  />
                ))}
              </div>
            </div>
            <div className={styles.landingPanel}>
              <div className={styles.landingDecorLayer} aria-hidden="true">
                {landingDecorFlowers.map((flower, index) => (
                  <img
                    key={`landing-panel-${index}`}
                    src={flowerAssets[(index + 3) % flowerAssets.length]}
                    alt=""
                    className={styles.decorFlowerSoft}
                    style={
                      {
                        left: "left" in flower ? flower.left : undefined,
                        right: "right" in flower ? flower.right : undefined,
                        top: "top" in flower ? flower.top : undefined,
                        bottom: "bottom" in flower ? flower.bottom : undefined,
                        width: `calc(${flower.size} * 0.72)`,
                        height: `calc(${flower.size} * 0.72)`,
                        opacity: flower.opacity * 0.85,
                        transform: `rotate(${flower.rotate})`
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <div className={styles.landingIntro}>
                <span className={styles.landingEyebrow}>Realtime Co-op</span>
                <h1 className={styles.landingTitle}>Begùme</h1>
                <h2>Create a room or join one with a code.</h2>
              </div>
              <div className={styles.identityBlock}>
                <span className={styles.inputSectionLabel}>Your name</span>
                <input
                  className={styles.roomCodeInput}
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="YOUR NAME"
                  maxLength={24}
                />
              </div>
              <div className={styles.landingActionRow}>
                <button
                  className={styles.primaryButton}
                  onClick={handleCreateRoom}
                  disabled={isBusy}
                >
                  {isBusy ? "Creating room..." : "Create Room"}
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    if (isJoinExpanded) {
                      void handleJoinRoom();
                      return;
                    }

                    setIsJoinExpanded(true);
                  }}
                  disabled={isBusy}
                >
                  {isBusy ? "Joining room..." : isJoinExpanded ? "Join with Code" : "Join Room"}
                </button>
              </div>
              <div
                className={`${styles.joinRevealPanel} ${
                  isJoinExpanded ? styles.joinRevealPanelOpen : ""
                }`}
              >
                <div className={styles.joinStack}>
                  <span className={styles.inputSectionLabel}>Room code</span>
                  <input
                    className={styles.roomCodeInput}
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleJoinRoom();
                      }
                    }}
                    placeholder="ROOM CODE"
                    maxLength={6}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {room && session && session.status === "COMPLETED" && !lastResult && (
        <section className={styles.completionScreen}>
          <div className={styles.completionHero}>
            <span className={styles.completionEyebrow}>Match complete</span>
            <h1>{session.totalScore}</h1>
            <p>Total score</p>
            <button
              type="button"
              className={styles.playAgainButton}
              onClick={() => void handlePlayAgain()}
              disabled={isBusy}
            >
              {isBusy ? "Starting..." : "Play Again"}
            </button>
          </div>
          <div className={styles.completedDishList}>
            {session.solvedRounds.map((round) => (
              <article key={round.id} className={styles.completedDishRow}>
                <img
                  src={round.dishImageUrl}
                  alt={round.dishTitle}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = foodImageFallback;
                  }}
                />
                <div className={styles.completedDishInfo}>
                  <span>Round {round.roundNumber}</span>
                  <h2>{round.dishTitle}</h2>
                  <p>{round.countryName}</p>
                </div>
                <div className={styles.completedDishScore}>
                  <strong>{round.roundScore}</strong>
                  <span>{round.guessedCorrectly ? "Solved" : "Revealed"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {room && session && (session.status !== "COMPLETED" || lastResult) && (
        <>
          <section className={styles.stage}>
            <article className={styles.leftPanel}>
              {lastResult?.roundEnded ? (
                <>
                  <div className={styles.roundReveal}>
                    <img
                      src={lastResult.dishImageUrl}
                      alt={lastResult.dishTitle}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = foodImageFallback;
                      }}
                    />
                    <div className={styles.roundRevealShade} />
                    {lastResult.correct ? (
                      <div className={`${styles.trophyReveal} ${styles.trophyRevealWin}`}>
                        <svg viewBox="0 0 64 64" aria-hidden="true">
                          <path d="M20 10h24v10c0 10-5 18-12 18s-12-8-12-18V10Z" />
                          <path d="M20 15H10v4c0 8 5 13 13 13M44 15h10v4c0 8-5 13-13 13M32 38v9M23 54h18M27 47h10v7" />
                        </svg>
                        <strong>Correct!</strong>
                        <span>+{lastResult.scoreDelta} points</span>
                      </div>
                    ) : (
                      <div className={`${styles.countryReveal} ${styles.countryRevealLoss}`}>
                        <div className={styles.lossBurst} aria-hidden="true">
                          <span />
                          <span />
                        </div>
                        <span>{lastResult.exhausted ? "Round lost" : "No one solved it"}</span>
                        <strong>{lastResult.revealCountry}</strong>
                        <p>Moving to the next dish...</p>
                      </div>
                    )}
                  </div>
                  <div className={styles.recipeBlock}>
                    <div className={styles.recipeSection}>
                      <h3>{lastResult.dishTitle}</h3>
                      <p>
                        {lastResult.correct
                          ? "Great guess. The next dish is loading."
                          : "Five guesses used. The answer has been revealed."}
                      </p>
                    </div>
                  </div>
                </>
              ) : currentRound ? (
                <>
                  <div className={styles.imageWrap}>
                    {wrongGuessCount >= 2 && currentRound.dish.title.trim() ? (
                      <div className={styles.dishTitleHint}>
                        <span>Dish</span>
                        <strong>{currentRound.dish.title}</strong>
                      </div>
                    ) : null}
                    <img
                      src={currentRound.dish.imageUrl}
                      alt={currentRound.dish.title}
                      className={styles.image}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = foodImageFallback;
                      }}
                    />
                  </div>

                  <div className={styles.recipeBlock}>
                    <div className={styles.recipeSection}>
                      <h3>Ingredients</h3>
                      <ul className={styles.ingredientList}>
                        {currentRound.dish.ingredients.map((ingredient, index) => (
                          <li key={`${index}-${ingredient}`}>{ingredient}</li>
                        ))}
                      </ul>
                    </div>

                    <div className={styles.recipeSection}>
                      <h3>Recipe</h3>
                      <p className={styles.instructions}>
                        {currentRound.dish.instructions || "Keep guessing to reveal more."}
                      </p>
                    </div>
                  </div>
                </>
              ) : null}
            </article>

            <section className={styles.rightPanel}>
              <div className={styles.chatBox}>
                <div className={styles.panelHeading}>
                  <h2>Room Chat</h2>
                  <div className={styles.memberList} aria-label="Room members">
                    {room.members.map((member) => (
                      <span key={member.id} className={styles.memberChip}>
                        {member.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.chatMessages} ref={chatScrollerRef}>
                  {roomMessages.length > 0 ? (
                    roomMessages.map((message: RoomMessageView) => {
                      const isOwnMessage = message.memberId === room.selfMemberId;
                      const groupedReactions = Array.from(
                        message.reactions.reduce((map, reaction) => {
                          map.set(reaction.emoji, (map.get(reaction.emoji) ?? 0) + 1);
                          return map;
                        }, new Map<string, number>())
                      );
                      const isActionOpen = activeMessageActionId === message.id;
                      const isReactionPending = reactingMessageId === message.id;
                      const isEmojiOnly = isEmojiOnlyMessage(message.text);
                      const repliedMessage = message.replyTo
                        ? roomMessages.find((item) => item.id === message.replyTo?.id) ?? null
                        : null;

                      return (
                        <div
                          key={message.id}
                          className={`${styles.chatMessageRow} ${
                            activeReactionPickerMessageId === message.id
                              ? styles.chatMessageRowActive
                              : ""
                          } ${
                            groupedReactions.length > 0 ? styles.chatMessageRowWithReaction : ""
                          }`}
                        >
                          <div
                            className={
                              isOwnMessage ? styles.chatMessageOwn : styles.chatMessageOther
                            }
                            onMouseEnter={() => setActiveMessageActionId(message.id)}
                            ref={isActionOpen ? reactionPickerRef : null}
                          >
                            {message.replyTo ? (
                              <button
                                type="button"
                                className={styles.chatReplyPreview}
                                onClick={() => setReplyTarget(repliedMessage)}
                              >
                                <span className={styles.chatReplyQuote}>
                                  {message.replyTo.text}
                                </span>
                              </button>
                            ) : null}
                            {isEmojiOnly ? (
                              <span className={styles.chatEmojiMessage}>{message.text}</span>
                            ) : (
                              <p>{message.text}</p>
                            )}
                            {groupedReactions.length > 0 ? (
                              <div className={styles.chatReactionBadgeRow}>
                                {groupedReactions.map(([emoji, count]) => (
                                  <button
                                    key={`${message.id}-${emoji}`}
                                    type="button"
                                    className={`${styles.chatReactionBadge} ${
                                      message.reactions.some(
                                        (reaction) =>
                                          reaction.memberId === room.selfMemberId &&
                                          reaction.emoji === emoji
                                      )
                                        ? styles.chatReactionBadgeSelected
                                        : ""
                                    }`}
                                    onClick={() => void handleMessageReaction(message.id, emoji)}
                                    disabled={isReactionPending}
                                  >
                                    <span>{emoji}</span>
                                    {count > 1 ? <strong>{count}</strong> : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            <div
                              className={`${styles.chatMessageActions} ${
                                isActionOpen ? styles.chatMessageActionsOpen : ""
                              } ${isOwnMessage ? styles.chatMessageActionsOwn : styles.chatMessageActionsOther}`}
                            >
                              <button
                                type="button"
                                className={styles.chatActionIconButton}
                                onClick={() => {
                                  setActiveMessageActionId(message.id);
                                  setActiveReactionPickerMessageId((currentId) => {
                                    const nextId = currentId === message.id ? null : message.id;

                                    if (nextId === null) {
                                      setIsReactionEmojiPickerOpen(false);
                                    }

                                    return nextId;
                                  });
                                }}
                                aria-label="React to message"
                                disabled={isReactionPending}
                              >
                                ☺
                              </button>
                              <button
                                type="button"
                                className={styles.chatActionIconButton}
                                onClick={() => {
                                  setReplyTarget(message);
                                  setActiveMessageActionId(null);
                                  setActiveReactionPickerMessageId(null);
                                }}
                                aria-label="Reply to message"
                              >
                                ↩
                              </button>
                            </div>
                            {activeReactionPickerMessageId === message.id ? (
                              <div className={styles.chatReactionPopover}>
                                <div className={styles.chatReactionQuickRow}>
                                  {loveReactionEmojis.map((emoji) => (
                                    <button
                                      key={`${message.id}-${emoji}`}
                                      type="button"
                                      className={`${styles.chatReactionQuickButton} ${
                                        message.reactions.some(
                                          (reaction) =>
                                            reaction.memberId === room.selfMemberId &&
                                            reaction.emoji === emoji
                                        )
                                          ? styles.chatReactionQuickButtonSelected
                                          : ""
                                      }`}
                                      onClick={() => void handleMessageReaction(message.id, emoji)}
                                      disabled={isReactionPending}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    className={styles.chatReactionMoreButton}
                                    onClick={() => {
                                      setActiveMessageActionId(message.id);
                                      setActiveReactionPickerMessageId(message.id);
                                      setIsReactionEmojiPickerOpen((isOpen) => !isOpen);
                                    }}
                                    aria-label="More emojis"
                                    disabled={isReactionPending}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                      })
                  ) : (
                    <div className={styles.chatEmptyState}>
                      <strong>No messages yet</strong>
                      <span>
                        Start the conversation{" "}
                        <span className={styles.chatEmptyPromptHighlight}>
                          "Marketing&apos;i ne yaptın"
                        </span>
                      </span>
                    </div>
                  )}
                </div>
                {isReactionEmojiPickerOpen && activeReactionPickerMessageId ? (
                  <div
                    className={styles.chatReactionPickerOverlay}
                    ref={reactionEmojiPickerRef}
                  >
                    <button
                      type="button"
                      className={styles.chatReactionPickerClose}
                      onClick={() => setIsReactionEmojiPickerOpen(false)}
                      aria-label="Close emoji picker"
                    >
                      ×
                    </button>
                    <EmojiPicker
                      onEmojiClick={handleReactionEmojiClick}
                      emojiStyle={EmojiStyle.NATIVE}
                      theme={Theme.LIGHT}
                      width="100%"
                      height="100%"
                      searchPlaceHolder="Search emoji"
                      previewConfig={{ showPreview: false }}
                      lazyLoadEmojis
                    />
                  </div>
                ) : null}
                <div className={styles.chatControls}>
                  {replyTarget ? (
                    <div className={styles.replyComposerBar}>
                      <div className={styles.replyComposerCopy}>
                        <strong>Replying to {replyTarget.senderName}</strong>
                        <span>{replyTarget.text}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.replyDismissButton}
                        onClick={() => setReplyTarget(null)}
                        aria-label="Cancel reply"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <div className={styles.chatComposer}>
                    <div className={styles.composerEmojiAnchor} ref={composerEmojiRef}>
                      <button
                        type="button"
                        className={`${styles.composerEmojiButton} ${
                          isComposerEmojiPanelOpen ? styles.composerEmojiButtonOpen : ""
                        }`}
                        onClick={() => {
                          setIsComposerEmojiPanelOpen((isOpen) => !isOpen);
                          setIsComposerEmojiPickerOpen(false);
                          setActiveMessageActionId(null);
                          setActiveReactionPickerMessageId(null);
                          setIsReactionEmojiPickerOpen(false);
                        }}
                        aria-label="Add emoji"
                        aria-expanded={isComposerEmojiPanelOpen}
                      >
                        ☺
                      </button>
                      {isComposerEmojiPanelOpen ? (
                        <div className={styles.composerEmojiPanel}>
                          <div className={styles.composerEmojiQuickRow}>
                            {loveReactionEmojis.map((emoji) => (
                              <button
                                key={`composer-${emoji}`}
                                type="button"
                                className={styles.composerEmojiQuickButton}
                                onClick={() =>
                                  setChatDraft((currentDraft) => `${currentDraft}${emoji}`)
                                }
                              >
                                {emoji}
                              </button>
                            ))}
                            <button
                              type="button"
                              className={styles.composerEmojiMoreButton}
                              onClick={() =>
                                setIsComposerEmojiPickerOpen((isOpen) => !isOpen)
                              }
                              aria-label="More emojis"
                            >
                              +
                            </button>
                          </div>
                          {isComposerEmojiPickerOpen ? (
                            <div className={styles.composerEmojiPickerPanel}>
                              <EmojiPicker
                                onEmojiClick={handleComposerEmojiClick}
                                emojiStyle={EmojiStyle.NATIVE}
                                theme={Theme.LIGHT}
                                width="100%"
                                height="100%"
                                searchPlaceHolder="Search emoji"
                                previewConfig={{ showPreview: false }}
                                lazyLoadEmojis
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <input
                      className={styles.chatInput}
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void sendChatMessage();
                        }
                      }}
                      placeholder="Write a message"
                      maxLength={280}
                    />
                    <button
                      type="button"
                      className={styles.sendButton}
                      onClick={() => void sendChatMessage()}
                      disabled={!chatDraft.trim() || isBusy}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>

              {currentRound && session.status !== "COMPLETED" && !lastResult && (
                <div className={styles.searchPanel}>
                  <div className={styles.panelHeading}>
                    <h2>Guess the Country</h2>
                    <span className={styles.guessCount}>{currentRound.guesses.length} tries</span>
                  </div>
                  <div
                    className={styles.answerInputStack}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setIsCountryMenuOpen(false);
                      }
                    }}
                  >
                    <div className={styles.answerSearchFrame}>
                      <input
                        className={styles.searchInput}
                        value={query}
                        onFocus={() => setIsCountryMenuOpen(true)}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setIsCountryMenuOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setIsCountryMenuOpen(false);
                          }
                        }}
                        placeholder={
                          room?.roomStatus !== "IN_PROGRESS"
                            ? "Waiting for player 2"
                            : "Choose a country"
                        }
                        role="combobox"
                        aria-expanded={isCountryMenuOpen}
                        aria-controls="country-options"
                        disabled={!canGuess}
                      />
                      <button
                        type="button"
                        className={styles.countryMenuToggle}
                        onClick={() => setIsCountryMenuOpen((isOpen) => !isOpen)}
                        aria-label={isCountryMenuOpen ? "Close country list" : "Open country list"}
                        aria-expanded={isCountryMenuOpen}
                        disabled={!canGuess}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path d="m6 8 4 4 4-4" />
                        </svg>
                      </button>
                      {isCountryMenuOpen && canGuess ? (
                        <span className={styles.answerSearchMeta}>
                          {filteredCountries.length} matches
                        </span>
                      ) : null}
                    </div>
                    {isCountryMenuOpen &&
                      canGuess &&
                      filteredCountries.length > 0 && (
                      <div
                        id="country-options"
                        className={styles.answerResultsDropdown}
                        role="listbox"
                      >
                        <div className={styles.answerResultsUp}>
                          {filteredCountries.map((country) => (
                            <button
                              key={country.id}
                              type="button"
                              role="option"
                              aria-selected="false"
                              className={styles.countryButton}
                              onPointerDown={(event) => {
                                event.preventDefault();
                              }}
                              onClick={() => void handleGuess(country.id)}
                              disabled={isBusy}
                            >
                              <span className={styles.countryButtonLabel}>
                                <img
                                  src={country.flagUrl}
                                  alt={`${country.name} flag`}
                                  className={styles.flagIcon}
                                />
                                <span>{country.name}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.answerWrongList}>
                    <div className={styles.officialGuessList}>
                      {historySlots.map((guess, index) => {
                        if (!guess) {
                          return <div key={`empty-slot-${index}`} className={styles.historyEmptySlot} />;
                        }

                        const quadrant = compassQuadrant(guess.targetBearing);

                        return (
                          <div
                            key={guess.id}
                            className={`${styles.selectedItemBar} ${
                              guess.isCorrect ? styles.selectedItemSolved : ""
                            }`}
                          >
                            <div className={styles.historyMain}>
                              <span className={styles.historyCountry}>
                                {countriesById.get(guess.countryId)?.flagUrl && (
                                  <img
                                    src={countriesById.get(guess.countryId)?.flagUrl}
                                    alt={`${guess.countryName} flag`}
                                    className={styles.flagIcon}
                                  />
                                )}
                                <span>{guess.countryName}</span>
                              </span>
                            </div>
                            <div className={styles.historyAside}>
                              <span
                                className={`${styles.proximityPill} ${proximityToneClass(
                                  guess.proximityLabel,
                                  styles
                                )}`}
                              >
                                {guess.isCorrect ? "Correct" : guess.proximityLabel}
                              </span>
                              {!guess.isCorrect && (
                                <div className={styles.compassWrap}>
                                  <div
                                    className={styles.compassMini}
                                    style={
                                      {
                                        "--compass-rotation": `${quadrant.rotation}deg`
                                      } as CSSProperties
                                    }
                                  >
                                    <span className={styles.compassRing} />
                                    <span className={styles.compassDirectionCone} />
                                    <span className={styles.compassNorth}>N</span>
                                    <span className={styles.compassEast}>E</span>
                                    <span className={styles.compassSouth}>S</span>
                                    <span className={styles.compassWest}>W</span>
                                    <span className={styles.compassCenterDot} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </section>
        </>
      )}

      {error && <p className={styles.errorBox}>{error}</p>}
    </main>
  );
}
