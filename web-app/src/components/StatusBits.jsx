import React, { useEffect, useState } from 'react';
import { statusNeedsDots, statusText } from '../documentHelpers';

export function TypingDots() {
  const frames = ['', '.', '..', '...'];
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, 400);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="typing-dots" aria-hidden="true">{frames[frameIndex]}</span>;
}

export function renderStatus(status, progress) {
  if (status === 'completed') return statusText(status);
  if (typeof progress === 'number' && progress > 0) return <>{statusText(status)}{statusNeedsDots(status) && <TypingDots />} {progress}%</>;
  if (statusNeedsDots(status)) return <>{statusText(status)}<TypingDots /></>;
  return statusText(status);
}
