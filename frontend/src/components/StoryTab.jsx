import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { fetchGames, getTeamActiveSession, getTeamStartedSessions } from "../api";

export default function StoryTab({
  games,
  currentTeamId,
  viewerToken,
  activeGameOnly = false,
  activeSessionOverride = null,
  gameConfigOverride = null,
  onReplayIntro,
}) {
  const [selectedStoryNum, setSelectedStoryNum] = useState(4);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [storyText, setStoryText] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [gameStoryText, setGameStoryText] = useState("");
  const [gameStoryTitle, setGameStoryTitle] = useState("");
  const [selectedGameName, setSelectedGameName] = useState("");
  const [gameRulesText, setGameRulesText] = useState("");
  const [gameRulesTitle, setGameRulesTitle] = useState("Rules");
  const [selectedGameContentTab, setSelectedGameContentTab] = useState("story");
  const [storyList, setStoryList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [startedGameIds, setStartedGameIds] = useState([]);
  const [gameConfigById, setGameConfigById] = useState({});

  const isHtmlFallbackDocument = (text) => /<!doctype html>/i.test(text) || /<div\s+id=["']root["']\s*>/i.test(text);
  const toStoryKey = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  // Extract title from story - supports both markdown (# Title) and bracket [Title] formats
  const extractTitle = (text, fallback = "Story") => {
    // Try markdown H1 first
    let match = text.match(/^#\s+(.+?)$/m);
    if (match) return match[1].trim();
    
    // Fall back to bracket format
    match = text.match(/\[(.*?)\]/);
    return match ? match[1].trim() : fallback;
  };

  // Extract body without the title line
  const extractBody = (text) => {
    const lines = text.split("\n");
    
    // Check for markdown H1 title
    let titleLineIndex = lines.findIndex((line) => line.startsWith("#"));
    if (titleLineIndex >= 0) {
      return lines.slice(titleLineIndex + 1).join("\n").trim();
    }
    
    // Check for bracket title
    titleLineIndex = lines.findIndex((line) => line.startsWith("["));
    if (titleLineIndex >= 0) {
      return lines.slice(titleLineIndex + 1).join("\n").trim();
    }
    
    return text;
  };

  // Load all story episodes on mount (not needed during active-game-only mode)
  useEffect(() => {
    if (activeGameOnly) return;

    const loadStories = async () => {
      try {
        const stories = [];
        for (let i = 1; i <= 6; i++) {
          const response = await fetch(`/story/${i}.txt`);
          if (response.ok) {
            const text = await response.text();
            if (isHtmlFallbackDocument(text)) continue;
            const title = extractTitle(text);
            stories.push({ num: i, title });
          }
        }
        setStoryList(stories);

        // Always attempt to load episode 4 first; UI shows a clear fallback if missing.
        loadMainStory(4);
      } catch (err) {
        setError("Failed to load stories");
      }
    };
    loadStories();
  }, [activeGameOnly]);

  useEffect(() => {
    if (gameConfigOverride) {
      setGameConfigById(gameConfigOverride);
      return;
    }

    const loadGameCatalog = async () => {
      try {
        const allGames = await fetchGames();
        const nextMap = {};
        for (const game of allGames) {
          nextMap[game.id] = game.config_key || "";
        }
        setGameConfigById(nextMap);
      } catch {
        // Non-critical: fallback path still works for numeric filenames.
      }
    };
    loadGameCatalog();
  }, [gameConfigOverride]);

  // Poll active session and permanently unlocked sessions.
  useEffect(() => {
    if (activeGameOnly && activeSessionOverride) {
      setActiveSession(activeSessionOverride);
      setSelectedGameId(activeSessionOverride.game_id);
      const game = games.find((g) => g.game_id === activeSessionOverride.game_id);
      loadGameStory(activeSessionOverride.game_id, game?.game_name || `Game ${activeSessionOverride.game_id}`, { silent: true });
      return undefined;
    }

    if (!currentTeamId || !viewerToken) return;

    const refreshSessions = async () => {
      try {
        const [session, started] = await Promise.all([
          getTeamActiveSession(viewerToken, currentTeamId),
          getTeamStartedSessions(viewerToken, currentTeamId),
        ]);
        setStartedGameIds(Array.from(new Set(started.map((entry) => entry.game_id))));

        if (session) {
          setActiveSession(session);
          setSelectedGameId(session.game_id);
          const game = games.find((g) => g.game_id === session.game_id);
          const hasResolvedMetadata = Boolean(game?.game_name || gameConfigById[session.game_id]);
          const usedGenericFallbackTitle = gameStoryTitle === `Game ${session.game_id} - No story available`;
          const missingLoadedStory = !gameStoryText;

          // Load on new session, or retry once real metadata is available after a generic fallback attempt.
          if (
            selectedGameId !== session.game_id
            || missingLoadedStory
            || (hasResolvedMetadata && usedGenericFallbackTitle)
          ) {
            loadGameStory(session.game_id, game?.game_name || `Game ${session.game_id}`, { silent: true });
          }
        } else {
          setActiveSession(null);
          if (activeGameOnly) {
            setSelectedGameId(null);
            setGameStoryText("");
            setGameStoryTitle("");
            setGameRulesText("");
            setGameRulesTitle("Rules");
          }
        }
      } catch (err) {
        // Error checking session, continue normally
      }
    };

    refreshSessions();
    const interval = setInterval(refreshSessions, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [activeGameOnly, activeSessionOverride, currentTeamId, viewerToken, games, selectedGameId, gameConfigById, gameStoryTitle, gameStoryText]);

  const loadMainStory = async (storyNum) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/story/${storyNum}.txt`);
      if (!response.ok) throw new Error("Failed to load story");
      const text = await response.text();
      if (isHtmlFallbackDocument(text)) throw new Error("Story file missing");
      const title = extractTitle(text, `Episode ${storyNum}`);
      const body = extractBody(text);
      setStoryTitle(title);
      setStoryText(body);
      setSelectedStoryNum(storyNum);
      setSelectedGameId(null);
      setGameStoryText("");
      setGameStoryTitle("");
    } catch (err) {
      setError("Failed to load story");
    } finally {
      setIsLoading(false);
    }
  };

  const loadGameStory = async (gameId, gameName, options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) setIsLoading(true);
      const candidates = [
        gameConfigById[gameId],
        toStoryKey(gameName),
        String(gameId),
      ].filter(Boolean);

      for (const key of candidates) {
        const response = await fetch(`/story/games/${key}.txt`);
        if (!response.ok) continue;
        const text = await response.text();
        if (isHtmlFallbackDocument(text)) continue;
        const title = extractTitle(text, gameName);
        const body = extractBody(text);
        setSelectedGameName(gameName);
        setGameStoryTitle(title);
        setGameStoryText(body);
        setSelectedGameId(gameId);
        setSelectedGameContentTab("story");
        return;
      }

      throw new Error("No story for this game");
    } catch (err) {
      setGameStoryText("");
      setSelectedGameName(gameName);
      setGameStoryTitle(`${gameName} - No story available`);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const loadGameRules = async (gameId, gameName, options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) setIsLoading(true);
      const candidates = [
        gameConfigById[gameId],
        toStoryKey(gameName),
        String(gameId),
      ].filter(Boolean);

      for (const key of candidates) {
        const response = await fetch(`/story/rules/${key}.txt`);
        if (!response.ok) continue;
        const text = await response.text();
        if (isHtmlFallbackDocument(text)) continue;
        const title = extractTitle(text, `${gameName} Rules`);
        const body = extractBody(text);
        setSelectedGameName(gameName);
        setGameRulesTitle(title);
        setGameRulesText(body);
        setSelectedGameId(gameId);
        setSelectedGameContentTab("rules");
        return;
      }

      setGameRulesTitle(`${gameName} - No rules available`);
      setGameRulesText("");
      setSelectedGameName(gameName);
      setSelectedGameId(gameId);
      setSelectedGameContentTab("rules");
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const unlockedGames = games.filter((game) => startedGameIds.includes(game.game_id));

  if (activeGameOnly) {
    return (
      <section className="story-section">
        <div className="story-container">
          <div className="story-top-actions">
            <button type="button" className="compact outline" onClick={() => onReplayIntro?.()}>
              Replay intro
            </button>
          </div>
          <div className="story-content-wrapper">
            {isLoading && <p className="muted">Loading...</p>}
            {error && <p className="error-text">{error}</p>}

            {selectedGameId === null ? (
              <p className="muted">Waiting for active game story...</p>
            ) : gameStoryText ? (
              <div className="story-content">
                <h3>{gameStoryTitle}</h3>
                <div className="story-body">
                  <ReactMarkdown>{gameStoryText}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <p className="muted">{gameStoryTitle || "No story available for this game."}</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="story-section">
      <div className="story-container">
        <div className="story-top-actions">
          <button type="button" className="compact outline" onClick={() => onReplayIntro?.()}>
            Replay intro
          </button>
        </div>

        {/* Active game session banner */}
        {activeSession && (
          <div className="active-game-banner">
            <strong>🎯 Active Game</strong>
            <p>A game is currently in progress. Read the story and prepare for the challenge!</p>
          </div>
        )}

        {/* Main story selection */}
        <div className="story-episodes">
          <h4>Story Episodes</h4>
          <div className="episode-tabs">
            {storyList.map((story) => (
              <button
                key={story.num}
                type="button"
                className={selectedStoryNum === story.num && selectedGameId === null ? "episode-tab active" : "episode-tab"}
                onClick={() => loadMainStory(story.num)}
                title={story.title}
              >
                {story.num}. {story.title}
              </button>
            ))}
          </div>
        </div>

        {/* Content display */}
        <div className="story-content-wrapper">
          {isLoading && <p className="muted">Loading...</p>}
          {error && <p className="error-text">{error}</p>}

          {selectedGameId === null && storyText && (
            <div className="story-content">
              <h3>{storyTitle}</h3>
              <div className="story-body">
                <ReactMarkdown>{storyText}</ReactMarkdown>
              </div>

              {/* Game stories section: appears in episode 6 (Các nghi phạm) only. */}
              {selectedStoryNum === 6 && unlockedGames.length > 0 && (
                <div className="game-stories-section">
                  <h4>Các nghi phạm</h4>
                  <div className="game-story-tabs">
                    {unlockedGames.map((game) => (
                      <button
                        key={game.game_id}
                        type="button"
                        className={selectedGameId === game.game_id ? "game-story-tab active" : "game-story-tab"}
                        onClick={() => loadGameStory(game.game_id, game.game_name)}
                      >
                        {game.game_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedGameId === null && !storyText && !isLoading && !error ? (
            <p className="muted">No story content available yet.</p>
          ) : null}

          {selectedGameId !== null && (
            <div className="story-content">
              <button
                type="button"
                className="back-button"
                onClick={() => {
                  setSelectedGameId(null);
                  setSelectedGameContentTab("story");
                }}
              >
                ← Back to episode
              </button>

              <div className="view-tabs">
                <button
                  type="button"
                  className={selectedGameContentTab === "story" ? "game-tab active" : "game-tab"}
                  onClick={() => setSelectedGameContentTab("story")}
                >
                  Story
                </button>
                <button
                  type="button"
                  className={selectedGameContentTab === "rules" ? "game-tab active" : "game-tab"}
                  onClick={() => {
                    setSelectedGameContentTab("rules");
                    if (selectedGameId !== null && !gameRulesText) {
                      loadGameRules(selectedGameId, selectedGameName || `Game ${selectedGameId}`, { silent: true });
                    }
                  }}
                >
                  Rules
                </button>
              </div>

              {selectedGameContentTab === "story" ? (
                gameStoryText ? (
                  <>
                    <h3>{gameStoryTitle}</h3>
                    <div className="story-body">
                      <ReactMarkdown>{gameStoryText}</ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <p className="muted">{gameStoryTitle || "No story available for this game."}</p>
                )
              ) : (
                gameRulesText ? (
                  <>
                    <h3>{gameRulesTitle}</h3>
                    <div className="story-body">
                      <ReactMarkdown>{gameRulesText}</ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <p className="muted">{gameRulesTitle || "No rules available for this game."}</p>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
