"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { createSession, fetchSession, fetchCountries, submitGuess } from "@/lib/api";
import type { CountryOption, GuessResponse, SessionView } from "@/lib/types";

import styles from "./game-app.module.css";

const reactionEmojis = ["🔥", "😮", "🤔", "🌍", "👏", "😅"];
const chatSpeakers = ["Player 1", "Player 2"] as const;

function filterCountries(query: string, countries: CountryOption[]) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return countries
    .filter((country) => country.name.toLowerCase().startsWith(normalizedQuery))
    .slice(0, 12);
}

type ChatSpeaker = (typeof chatSpeakers)[number];
type ChatMessage = { id: string; speaker: ChatSpeaker; text: string };

export function GameApp() {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [session, setSession] = useState<SessionView | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<GuessResponse["guessResult"] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeSpeaker, setActiveSpeaker] = useState<ChatSpeaker>("Player 1");
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: "chat-1", speaker: "Player 1", text: "I think this dish looks Mediterranean." },
    { id: "chat-2", speaker: "Player 2", text: "Maybe. Let us compare the ingredients first." }
  ]);

  useEffect(() => {
    startTransition(() => {
      void (async () => {
        try {
          const loadedCountries = await fetchCountries();
          setCountries(loadedCountries);
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load countries.");
        }
      })();
    });
  }, []);

  const filteredCountries = useMemo(
    () => filterCountries(query, countries),
    [query, countries]
  );
  const countriesById = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries]
  );
  const countriesByName = useMemo(
    () => new Map(countries.map((country) => [country.name, country])),
    [countries]
  );

  async function handleStart() {
    setError(null);
    setLastResult(null);

    startTransition(() => {
      void (async () => {
        try {
          const nextSession = await createSession();
          setSession(nextSession);
          setQuery("");
        } catch (startError) {
          setError(startError instanceof Error ? startError.message : "Failed to start game.");
        }
      })();
    });
  }

  async function handleGuess(countryId: string) {
    if (!session) {
      return;
    }

    setError(null);

    startTransition(() => {
      void (async () => {
        try {
          const result = await submitGuess(session.id, countryId);
          setSession(result.session);
          setLastResult(result.guessResult);
          setQuery("");
        } catch (guessError) {
          setError(guessError instanceof Error ? guessError.message : "Failed to submit guess.");
        }
      })();
    });
  }

  async function refreshSession() {
    if (!session) {
      return;
    }

    const nextSession = await fetchSession(session.id);
    setSession(nextSession);
  }

  const currentRound = session?.currentRound ?? null;
  const currentSolvedCount = session?.completedRounds ?? 0;

  function sendChatMessage() {
    const trimmedDraft = chatDraft.trim();

    if (!trimmedDraft) {
      return;
    }

    setChatMessages((messages) => [
      ...messages,
      {
        id: `${activeSpeaker}-${Date.now()}`,
        speaker: activeSpeaker,
        text: trimmedDraft
      }
    ]);
    setChatDraft("");
  }

  function appendEmojiToChat(emoji: string) {
    setChatDraft((currentValue) => `${currentValue}${emoji}`);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brandStrip}>
          <div className={styles.brandBadge}>✳</div>
          <p className={styles.kicker}>Food Guessr</p>
        </div>
        <div className={styles.scoreDock}>
          <div className={styles.scoreCard}>
            <span className={styles.metaLabel}>Score</span>
            <strong>{session?.totalScore ?? 0}</strong>
          </div>
          <div className={styles.scoreCard}>
            <span className={styles.metaLabel}>Round</span>
            <strong>
              {session ? Math.min(session.currentRoundIndex + 1, session.roundCount) : 1} /{" "}
              {session?.roundCount ?? 5}
            </strong>
          </div>
        </div>
      </header>

      {!session && (
        <section className={styles.emptyState}>
          <div className={styles.emptyPanel}>
            <h2>Start a 5-round run</h2>
            <p>The backend controls round selection, scoring, and the correct answers.</p>
            <p className={styles.emptyNote}>
              Layout is ready as a single-page game screen. Start to see the live state.
            </p>
            <button className={styles.primaryButton} onClick={handleStart} disabled={isPending}>
              {isPending ? "Starting..." : "Start game"}
            </button>
          </div>
        </section>
      )}

      {session && (
        <>
          <section className={styles.stage}>
          <article className={styles.leftPanel}>
            {currentRound ? (
              <>
                <div className={styles.imageWrap}>
                  <img
                    src={currentRound.dish.imageUrl}
                    alt="Meal for the current round"
                    className={styles.image}
                  />
                </div>

                <div className={styles.recipeBlock}>
                  <div className={styles.recipeSection}>
                    <h3>Ingredients</h3>
                    <ul className={styles.ingredientList}>
                      {currentRound.dish.ingredients.map((ingredient) => (
                        <li key={ingredient}>{ingredient}</li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.recipeSection}>
                    <h3>Recipe</h3>
                    <p className={styles.instructions}>{currentRound.dish.instructions}</p>
                    <p className={styles.debugAnswer}>
                      Debug country: {currentRound.debugCountryName}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.summaryBox}>
                <h2>Run complete</h2>
                <p>You finished all 5 rounds.</p>
                <p className={styles.summaryScore}>Final score: {session.totalScore}</p>
                <button className={styles.primaryButton} onClick={handleStart} disabled={isPending}>
                  Play again
                </button>
              </div>
            )}
          </article>

          <section className={styles.rightPanel}>
            <div className={styles.chatBox}>
              <div className={styles.panelHeading}>
                <h2>Chat Box</h2>
                <span className={styles.statusPill}>{currentSolvedCount} solved</span>
              </div>
              <div className={styles.chatSpeakerTabs}>
                {chatSpeakers.map((speaker) => (
                  <button
                    key={speaker}
                    type="button"
                    className={speaker === activeSpeaker ? styles.activeTab : styles.chatTab}
                    onClick={() => setActiveSpeaker(speaker)}
                  >
                    {speaker}
                  </button>
                ))}
              </div>
              <div className={styles.chatMessages}>
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.speaker === "Player 1"
                        ? styles.chatMessageLeft
                        : styles.chatMessageRight
                    }
                  >
                    <span className={styles.chatSpeakerName}>{message.speaker}</span>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <div className={styles.chatComposer}>
                <input
                  className={styles.chatInput}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder={`${activeSpeaker} is typing...`}
                />
                <button type="button" className={styles.sendButton} onClick={sendChatMessage}>
                  Send
                </button>
              </div>
            </div>

            <div className={styles.emojiBar}>
              {reactionEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={styles.emojiButton}
                  onClick={() => appendEmojiToChat(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {currentRound && (
              <div className={styles.searchPanel}>
                <div className={styles.panelHeading}>
                  <h2>Official Answer</h2>
                  <span className={styles.statusPill}>Counts</span>
                </div>
                <div className={styles.answerInputStack}>
                  {filteredCountries.length > 0 && (
                    <div className={styles.answerResultsDropdown}>
                      <div className={styles.answerResultsUp}>
                        {filteredCountries.map((country) => (
                          <button
                            key={country.id}
                            className={styles.countryButton}
                            onClick={() => handleGuess(country.id)}
                            disabled={isPending}
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
                  <input
                    className={styles.searchInput}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Type the actual country answer"
                  />
                </div>
                <div className={styles.answerWrongList}>
                  {currentRound.guesses.length > 0 && (
                    <div className={styles.officialGuessList}>
                      <span className={styles.selectedItemsLabel}>Selected items</span>
                      {currentRound.guesses.map((guess) => (
                        <div key={guess.id} className={styles.selectedItemBar}>
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
                          <span className={styles.selectedPenalty}>-{guess.penalty}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </section>
          </section>
        </>
      )}

      {lastResult?.correct && (
        <section className={styles.revealCard}>
          <h2>Correct</h2>
          <p className={styles.revealCountry}>
            {lastResult.revealCountry && countriesByName.get(lastResult.revealCountry)?.flagUrl && (
              <img
                src={countriesByName.get(lastResult.revealCountry)?.flagUrl}
                alt={`${lastResult.revealCountry} flag`}
                className={styles.flagIconLarge}
              />
            )}
            <span>{lastResult.revealCountry}</span>
          </p>
          <p>Round score: +{lastResult.scoreDelta}</p>
          <button
            className={styles.primaryButton}
            onClick={async () => {
              setLastResult(null);
              await refreshSession();
            }}
          >
            Continue
          </button>
        </section>
      )}

      {lastResult && !lastResult.correct && (
        <section className={styles.feedbackCard}>
          <p>
            Wrong guess. Distance: {lastResult.distanceKm} km. Penalty: -
            {lastResult.penalty}
          </p>
        </section>
      )}

      {error && <p className={styles.errorBox}>{error}</p>}
    </main>
  );
}
