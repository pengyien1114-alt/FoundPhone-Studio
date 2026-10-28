import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Play, Pause } from "lucide-react";
import { safeMedia, type Item } from "./schema";
type Playback = {
  item: Item;
  playing: boolean;
  time: number;
  duration: number;
  toggle: () => void;
  seek: (time: number) => void;
};
const MusicContext = createContext<Playback | null>(null);
export const useOpeningMusic = () => useContext(MusicContext);
export function OpeningMusic({
  item,
  children,
}: {
  item?: Item;
  children: ReactNode;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0);
  const started = useRef(false);
  const src = item && safeMedia(item.media);
  const play = () => {
    const el = audio.current;
    if (!el) return;
    // Call play synchronously inside the gesture, including on iPhone Safari.
    void el
      .play()
      .then(() => {
        started.current = true;
      })
      .catch(() => {
        /* Next gesture or Music control can retry. */
      });
  };
  useEffect(() => {
    started.current = false;
    if (!src) return;
    const start = () => {
      if (!started.current) play();
    };
    document.addEventListener("pointerup", start);
    document.addEventListener("keydown", start);
    return () => {
      document.removeEventListener("pointerup", start);
      document.removeEventListener("keydown", start);
    };
  }, [src]);
  useEffect(() => {
    if (!src || !item || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.sender,
      album: item.meta.album,
    });
    navigator.mediaSession.setActionHandler("play", play);
    navigator.mediaSession.setActionHandler("pause", () =>
      audio.current?.pause(),
    );
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.metadata = null;
    };
  }, [src, item]);
  const value: Playback | null =
    item && src
      ? {
          item,
          playing,
          time,
          duration,
          toggle: () => {
            started.current = true;
            if (audio.current?.paused) play();
            else audio.current?.pause();
          },
          seek: (position) => {
            if (audio.current && Number.isFinite(position))
              audio.current.currentTime = Math.max(
                0,
                Math.min(duration, position),
              );
          },
        }
      : null;
  return (
    <MusicContext.Provider value={value}>
      {src && (
        <audio
          ref={audio}
          data-opening-music
          src={src}
          preload="auto"
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            started.current = true;
            setPlaying(false);
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      )}
      {children}
    </MusicContext.Provider>
  );
}
export function OpeningMusicControls() {
  const music = useOpeningMusic();
  if (!music) return null;
  return (
    <div className="opening-music-controls">
      <button
        aria-label={music.playing ? "暫停開屏音樂" : "播放開屏音樂"}
        onClick={music.toggle}
      >
        {music.playing ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <input
        aria-label="開屏音樂進度"
        type="range"
        min="0"
        max={music.duration || 79}
        step="0.1"
        value={music.time}
        onChange={(e) => music.seek(Number(e.target.value))}
      />
    </div>
  );
}
