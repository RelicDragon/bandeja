import { useEffect, useState } from 'react';

type StoryDmSendFlyoutProps = {
  emoji: string | null;
  onDone: () => void;
};

export function StoryDmSendFlyout({ emoji, onDone }: StoryDmSendFlyoutProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!emoji) {
      setActive(false);
      return;
    }
    setActive(true);
    const t = window.setTimeout(() => {
      setActive(false);
      onDone();
    }, 900);
    return () => window.clearTimeout(t);
  }, [emoji, onDone]);

  if (!emoji || !active) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center"
      aria-hidden
    >
      <span className="story-dm-flyout text-5xl drop-shadow-lg">{emoji}</span>
    </div>
  );
}
