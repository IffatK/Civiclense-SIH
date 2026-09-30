import { useRef, useState } from "react";
import { Icon } from "../Icons.jsx";

/**
 * The evidence.
 *
 * A native scroll-snap strip rather than a JavaScript carousel. Swiping on a
 * phone is then the browser's job — momentum, rubber-banding and the
 * accessibility behaviour all come free and all of it is better than a
 * hand-rolled touch handler. The arrows exist for pointers, which have no swipe.
 *
 * A photograph that fails to load is replaced in place. The whole point of the
 * card is the picture, but a broken one must not take the report down with it —
 * the words underneath are still worth reading.
 */
export default function Gallery({ images = [], alt = "", total, ratio = "16 / 10", eager }) {
  const strip = useRef(null);
  const [at, setAt] = useState(0);
  const [broken, setBroken] = useState({});

  const usable = images.filter(Boolean);
  if (usable.length === 0) return <div className="shot shot--none" style={{ aspectRatio: ratio }}>No photograph</div>;

  const go = (i) => {
    const next = Math.max(0, Math.min(usable.length - 1, i));
    setAt(next);
    strip.current?.scrollTo({ left: next * strip.current.clientWidth, behavior: "smooth" });
  };

  // Derived from scroll position rather than kept in step with it, so a swipe
  // and an arrow press cannot disagree about which image is showing.
  const onScroll = (e) => {
    const w = e.currentTarget.clientWidth || 1;
    const i = Math.round(e.currentTarget.scrollLeft / w);
    if (i !== at) setAt(i);
  };

  // A card shows at most three; the report may hold more. Saying so is more
  // honest than three dots that imply three.
  const extra = total && total > usable.length ? total - usable.length : 0;

  return (
    <div className="shotwrap">
      <div className="shot__strip" ref={strip} onScroll={onScroll} style={{ aspectRatio: ratio }}>
        {usable.map((src, i) =>
          broken[i] ? (
            <div key={i} className="shot shot--none">Photograph unavailable</div>
          ) : (
            <img
              key={i}
              src={src}
              alt={i === 0 ? alt : `${alt} — view ${i + 1}`}
              className="shot"
              loading={eager && i === 0 ? "eager" : "lazy"}
              decoding="async"
              onError={() => setBroken((b) => ({ ...b, [i]: true }))}
            />
          )
        )}
      </div>

      {usable.length > 1 && (
        <>
          <button
            type="button"
            className="shot__arrow shot__arrow--prev"
            aria-label="Previous photograph"
            disabled={at === 0}
            onClick={(e) => { e.preventDefault(); go(at - 1); }}
          >
            <Icon.chevronLeft width={18} height={18} />
          </button>
          <button
            type="button"
            className="shot__arrow shot__arrow--next"
            aria-label="Next photograph"
            disabled={at === usable.length - 1}
            onClick={(e) => { e.preventDefault(); go(at + 1); }}
          >
            <Icon.chevronRight width={18} height={18} />
          </button>

          <div className="shot__dots" role="tablist" aria-label="Photographs">
            {usable.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === at}
                aria-label={`Photograph ${i + 1}`}
                className="shot__dot"
                onClick={(e) => { e.preventDefault(); go(i); }}
              />
            ))}
          </div>
        </>
      )}

      {extra > 0 && <span className="shot__count">+{extra} more</span>}
    </div>
  );
}
