import React from "react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

const STORY_FILE_COUNT = 5;
const TEXT_REVEAL_MS = 2200;

async function loadStoryParts() {
  const parts = [];
  for (let index = 0; index < STORY_FILE_COUNT; index += 1) {
    try {
      const response = await fetch(`/story/${index}.txt`, { cache: "no-store" });
      if (!response.ok) {
        parts.push(`[Missing story file ${index}.txt]`);
        continue;
      }
      const text = (await response.text()).trim();
      if (!text) {
        parts.push({ title: "", body: `[Empty story file ${index}.txt]` });
        continue;
      }

      const lines = text.split(/\r?\n/);
      const firstLine = (lines[0] || "").trim();
      const bracketMatch = firstLine.match(/^\[(.*)\]$/);
      if (bracketMatch) {
        parts.push({
          title: bracketMatch[1].trim(),
          body: lines.slice(1).join("\n").trim(),
        });
      } else {
        parts.push({ title: "", body: text });
      }
    } catch {
      parts.push({ title: "", body: `[Error loading story file ${index}.txt]` });
    }
  }
  return parts;
}

export default function StoryIntro({ onFinish }) {
  const [parts, setParts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isTextFullyShown, setIsTextFullyShown] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    loadStoryParts().then((loaded) => {
      if (isCancelled) return;
      setParts(loaded);
      setIsReady(true);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady || parts.length === 0) return undefined;

    setIsTextFullyShown(false);
    const timeoutId = window.setTimeout(() => {
      setIsTextFullyShown(true);
    }, TEXT_REVEAL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [currentIndex, isReady, parts.length]);

  const currentText = useMemo(() => {
    if (!parts.length) return { title: "", body: "Loading opening sequence..." };
    return parts[currentIndex] || { title: "", body: "" };
  }, [currentIndex, parts]);

  const goToPrevious = () => {
    if (!parts.length) return;
    setCurrentIndex((previous) => Math.max(0, previous - 1));
  };

  const goToNext = () => {
    if (!parts.length) return;
    if (!isTextFullyShown) {
      setIsTextFullyShown(true);
      return;
    }
    if (currentIndex >= parts.length - 1) {
      onFinish();
      return;
    }
    setCurrentIndex((previous) => Math.min(parts.length - 1, previous + 1));
  };

  return (
    <div
      className="intro-overlay"
      role="dialog"
      aria-label="Opening story sequence"
      onClick={goToNext}
    >
      <div className="intro-grain" />
      <div className="intro-vignette" />

      <div className={`intro-content intro-scene-${currentIndex}`} key={currentIndex}>
        {currentText.title ? <p className="intro-step">{currentText.title}</p> : null}
        <div className="intro-body">
          <div className={isTextFullyShown ? "intro-text intro-text-shown" : "intro-text intro-text-animating"}>
            <ReactMarkdown>{currentText.body}</ReactMarkdown>
          </div>
        </div>

        <div className="intro-controls" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="intro-nav" onClick={goToPrevious} disabled={currentIndex === 0}>
            Previous
          </button>
          <button type="button" className="intro-nav" onClick={goToNext}>
            {!isTextFullyShown ? "Show Text" : currentIndex >= parts.length - 1 ? "Enter" : "Next"}
          </button>
        </div>
      </div>

      <button type="button" className="intro-skip" onClick={(event) => {
        event.stopPropagation();
        onFinish();
      }}>
        Skip Intro
      </button>
    </div>
  );
}
