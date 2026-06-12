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
  restartRoom,
  sendRoomMessage,
  submitGuess
} from "@/lib/api";
import { createRoomSocket } from "@/lib/socket";
import type {
  CountryOption,
  GuessResponse,
  RoomLaunchResponse,
  RoomMessageView
} from "@/lib/types";

import styles from "./game-app.module.css";

const historySlotCount = 5;
const foodImageFallback = "/food-placeholder.svg";
const landingPlates = [
  {
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    title: "Street Food"
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
    title: "Shared Table"
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    title: "Regional Dish"
  }
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
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const chatScrollerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

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

    node.scrollTop = node.scrollHeight;
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
        setLastResult(payload.guessResult);
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
    if (!isEmojiPickerOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isEmojiPickerOpen]);

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
    setLastResult(null);
    setIsBusy(true);

    try {
      const launch = await createRoom(trimmedName);
      setRoom(launch);
      setQuery("");
      setJoinCode("");
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
    setLastResult(null);
    setIsBusy(true);

    try {
      const launch = await joinRoom(normalizedCode, trimmedName);
      setRoom(launch);
      setQuery("");
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
      setLastResult(result.guessResult.roundEnded ? result.guessResult : null);
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
      const snapshot = await sendRoomMessage(room.roomCode, room.selfMemberId, trimmedText);
      applyRoomSnapshot(snapshot);

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

  function handleEmojiClick(emojiData: EmojiClickData) {
    setChatDraft((currentDraft) => `${currentDraft}${emojiData.emoji}`);
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
      setLastResult(null);
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
    setLastResult(null);
    setError(null);
    setChatDraft("");
    setIsCountryMenuOpen(false);
    setIsEmojiPickerOpen(false);
  }

  return (
    <main className={styles.shell}>
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
            <p className={styles.kicker}>Food Guessr</p>
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
              <div className={styles.landingIntro}>
                <span className={styles.landingEyebrow}>Realtime Co-op</span>
                <h1 className={styles.landingTitle}>Food Guessr</h1>
                <h2>Create a room or join one with a code.</h2>
              </div>
              <input
                className={styles.roomCodeInput}
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="YOUR NAME"
                maxLength={24}
              />
              <button
                className={styles.primaryButton}
                onClick={handleCreateRoom}
                disabled={isBusy}
              >
                {isBusy ? "Creating room..." : "Create Room"}
              </button>
              <div className={styles.landingDivider}>
                <span />
                <p>or</p>
                <span />
              </div>
              <div className={styles.joinStack}>
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
                <button
                  className={styles.secondaryButton}
                  onClick={handleJoinRoom}
                  disabled={isBusy}
                >
                  {isBusy ? "Joining room..." : "Join Room"}
                </button>
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
                      <div className={styles.trophyReveal}>
                        <svg viewBox="0 0 64 64" aria-hidden="true">
                          <path d="M20 10h24v10c0 10-5 18-12 18s-12-8-12-18V10Z" />
                          <path d="M20 15H10v4c0 8 5 13 13 13M44 15h10v4c0 8-5 13-13 13M32 38v9M23 54h18M27 47h10v7" />
                        </svg>
                        <strong>Correct!</strong>
                        <span>+{lastResult.scoreDelta} points</span>
                      </div>
                    ) : (
                      <div className={styles.countryReveal}>
                        <span>The correct country was</span>
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
                      <p className={styles.instructions}>{currentRound.dish.instructions}</p>
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

                      return (
                        <div
                          key={message.id}
                          className={isOwnMessage ? styles.chatMessageOwn : styles.chatMessageOther}
                        >
                          <p>{message.text}</p>
                        </div>
                        );
                      })
                  ) : (
                    <div className={styles.chatEmptyState}>
                      <strong>No messages yet</strong>
                      <span>Start the conversation with your teammate.</span>
                    </div>
                  )}
                </div>
                <div className={styles.chatControls}>
                  <div className={styles.chatComposer}>
                    <div className={styles.emojiPickerAnchor} ref={emojiPickerRef}>
                      <button
                        type="button"
                        className={styles.emojiToggleButton}
                        onClick={() => setIsEmojiPickerOpen((isOpen) => !isOpen)}
                        aria-label="Open emoji picker"
                        aria-expanded={isEmojiPickerOpen}
                      >
                        ☺
                      </button>
                      {isEmojiPickerOpen && (
                        <div className={styles.emojiPickerPanel}>
                          <EmojiPicker
                            onEmojiClick={handleEmojiClick}
                            emojiStyle={EmojiStyle.NATIVE}
                            theme={Theme.LIGHT}
                            width="100%"
                            height="100%"
                            searchPlaceHolder="Search emoji"
                            previewConfig={{ showPreview: false }}
                            lazyLoadEmojis
                          />
                        </div>
                      )}
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
