import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface PhotoViewerProps {
  photos: string[];
  initialIndex?: number;
  /** Shown under the counter so the viewer keeps context. */
  name?: string;
  onClose: () => void;
}

/**
 * Full-screen photo viewer.
 *
 * Swipes horizontally between photos (drag or arrow keys), locks the page
 * behind it so the profile cannot scroll underneath, and keeps the whole
 * frame visible with `object-contain` instead of cropping to the top.
 */
export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photos,
  initialIndex = 0,
  name,
  onClose
}) => {
  const safePhotos = photos.filter(Boolean);
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(safePhotos.length - 1, 0)));
  const [direction, setDirection] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  const go = useCallback((next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(Math.min(Math.max(next, 0), safePhotos.length - 1));
  }, [index, safePhotos.length]);

  // Lock the document while the viewer is open: position:fixed preserves the
  // member's place on the profile and stops swipe-up from scrolling it.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') go(index + 1);
      if (event.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, onClose]);

  // Warm the neighbours so a swipe never shows an empty frame.
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const src = safePhotos[i];
      if (!src) return;
      const img = new Image();
      img.src = src;
    });
  }, [index, safePhotos]);

  if (!safePhotos.length) return null;
  const hasPrev = index > 0;
  const hasNext = index < safePhotos.length - 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={name ? `${name} — photo ${index + 1} of ${safePhotos.length}` : `Photo ${index + 1} of ${safePhotos.length}`}
    >
      {/* Chrome */}
      <div className="relative z-20 flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-[0.8125rem] font-medium tabular-nums text-white/70">
          {index + 1} <span className="text-white/35">/ {safePhotos.length}</span>
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          aria-label="Close photo viewer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.img
            key={index}
            src={safePhotos[index]}
            alt={name ? `${name}, photo ${index + 1}` : `Photo ${index + 1}`}
            referrerPolicy="no-referrer"
            custom={direction}
            initial={{ opacity: 0, x: direction * 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -48 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            drag={safePhotos.length > 1 ? 'x' : false}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.24}
            onDragEnd={(_, info) => {
              const travelled = info.offset.x + info.velocity.x * 0.12;
              if (travelled < -64 && hasNext) go(index + 1);
              else if (travelled > 64 && hasPrev) go(index - 1);
            }}
            className="max-h-[calc(100dvh-9.5rem)] w-auto max-w-full touch-none select-none rounded-2xl object-contain"
            style={{ WebkitUserSelect: 'none' }}
          />
        </AnimatePresence>

        {hasPrev && (
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="absolute left-3 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:flex"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="absolute right-3 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:flex"
            aria-label="Next photo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Footer: dots + hint */}
      <div className="relative z-20 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {name ? <p className="max-w-[18rem] truncate text-[0.8125rem] text-white/60">{name}</p> : null}
        {safePhotos.length > 1 ? (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {safePhotos.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/30'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
