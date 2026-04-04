import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { fetchGames, getTeamActiveSession, getTeamStartedSessions } from "../api";

export default function StoryTab({ games, currentTeamId, viewerToken }) {
  const [selectedStoryNum, setSelectedStoryNum] = useState(4);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [storyText, setStoryText] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [gameStoryText, setGameStoryText] = useState("");
  const [gameStoryTitle, setGameStoryTitle] = useState("");
  const [storyList, setStoryList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [startedGameIds, setStartedGameIds] = useState([]);
  const [gameConfigById, setGameConfigById] = useState({});

  // Extract title from story - supports both markdown (# Title) and bracket [Title] formats
  const extractTitle = (text) => {
    // Try markdown H1 first
    let match = text.match(/^#\s+(.+?)$/m);
    if (match) return match[1].trim();
    
    // Fall back to bracket format
    match = text.match(/\[(.*?)\]/);
    return match ? match[1].trim() : "Untitled";
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

  // Load all story episodes on mount
  useEffect(() => {
    const loadStories = async () => {
      try {
        const stories = [];
        for (let i = 1; i <= 4; i++) {
          const response = await fetch(`/story/${i}.txt`);
          if (response.ok) {
            const text = await response.text();
            const title = extractTitle(text);
            stories.push({ num: i, title });
          }
        }
        setStoryList(stories);
        if (stories.length > 0) {
          loadMainStory(4); // Default to episode 4
        }
      } catch (err) {
        setError("Failed to load stories");
      }
    };
    loadStories();
  }, []);

  useEffect(() => {
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
  }, []);

  // Poll active session and permanently unlocked sessions.
  useEffect(() => {
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
          // Auto-load only when active game changed, so polling does not flash the UI.
          if (selectedGameId !== session.game_id) {
            const game = games.find((g) => g.game_id === session.game_id);
            if (game) {
              loadGameStory(session.game_id, game.game_name, { silent: true });
            }
          }
        } else {
          setActiveSession(null);
        }
      } catch (err) {
        // Error checking session, continue normally
      }
    };

    refreshSessions();
    const interval = setInterval(refreshSessions, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [currentTeamId, viewerToken, games, selectedGameId]);

  const loadMainStory = async (storyNum) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/story/${storyNum}.txt`);
      if (!response.ok) throw new Error("Failed to load story");
      const text = await response.text();
      const title = extractTitle(text);
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
      // Prefer config_key from /games since leaderboard payload doesn't include it.
      const configKey = gameConfigById[gameId] || String(gameId);
      
      const response = await fetch(`/story/games/${configKey}.txt`);
      if (!response.ok) throw new Error("No story for this game");
      
      const text = await response.text();
      const title = extractTitle(text);
      const body = extractBody(text);
      setGameStoryTitle(title);
      setGameStoryText(body);
      setSelectedGameId(gameId);
    } catch (err) {
      setGameStoryText("");
      setGameStoryTitle(`${gameName} - No story available`);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const unlockedGames = games.filter((game) => startedGameIds.includes(game.game_id));

  return (
    <section className="story-section">
      <div className="story-container">
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

              {/* Game stories section: appears in episode 4 only, and keeps unlocked games forever. */}
              {selectedStoryNum === 4 && unlockedGames.length > 0 && (
                <div className="game-stories-section">
                  <h4>Các vụ án</h4>
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

          {selectedGameId !== null && gameStoryText && (
            <div className="story-content">
              <button
                type="button"
                className="back-button"
                onClick={() => setSelectedGameId(null)}
              >
                ← Back to episode
              </button>
              <h3>{gameStoryTitle}</h3>
              <div className="story-body">
                <ReactMarkdown>{gameStoryText}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
