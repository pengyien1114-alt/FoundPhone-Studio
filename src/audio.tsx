import { useEffect, useRef } from "react";
import type { SkinProps } from "./AppSkins";
import { safeMedia, type Item } from "./schema";
import { useSkinState } from "./skinState";
import { OpeningMusicControls } from "./OpeningMusic";
export function useTrack(
  p: SkinProps,
  items: Item[],
): [Item | null, (item: Item | null) => void] {
  const [id, setId] = useSkinState<string>(p, "track", "");
  return [
    items.find((i) => i.id === id) ??
      items.find((i) => i.meta.opening === "true") ??
      null,
    (item) => {
      setId(item?.id ?? "");
      if (item) p.onRead(item.id);
    },
  ];
}
export function AudioPlayer({ p, item }: { p: SkinProps; item: Item }) {
  const last = useRef(-1);
  const element = useRef<HTMLAudioElement>(null);
  const key = `audio-${item.id}`,
    saved = p.ui?.[key];
  const commit = (time: number, force = false) => {
    if (!p.onUi || !Number.isFinite(time)) return;
    if (force || Math.abs(time - last.current) >= 5) {
      last.current = time;
      p.onUi(key, time);
    }
  };
  useEffect(() => {
    const audio = element.current;
    if (
      !audio ||
      typeof saved !== "number" ||
      !Number.isFinite(saved) ||
      saved <= 0
    )
      return;
    const restore = () => {
      if (audio.readyState < 1) return;
      last.current = saved;
      audio.currentTime = Math.min(
        saved,
        Number.isFinite(audio.duration) ? audio.duration : saved,
      );
    };
    restore();
    audio.addEventListener("loadedmetadata", restore, { once: true });
    return () => audio.removeEventListener("loadedmetadata", restore);
  }, [item.id]);
  if (item.meta.opening === "true") return <OpeningMusicControls />;
  return (
    <audio
      ref={element}
      controls
      src={safeMedia(item.media)}
      aria-label={`播放${item.title}`}
      onTimeUpdate={(e) => {
        if (e.currentTarget.isConnected) commit(e.currentTarget.currentTime);
      }}
      onPause={(e) => {
        if (e.currentTarget.isConnected)
          commit(e.currentTarget.currentTime, true);
      }}
      onEnded={(e) => commit(e.currentTarget.currentTime, true)}
    />
  );
}
