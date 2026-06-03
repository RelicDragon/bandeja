import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ServeSetupDiceButtonProps = {
  onRoll: () => void;
  disabled?: boolean;
};

const PIP_LAYOUT: Record<1 | 2 | 3 | 4 | 5 | 6, readonly boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

const FACE_VALUES: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  front: 1,
  back: 6,
  right: 3,
  left: 4,
  top: 5,
  bottom: 2,
};

function DiceFace({ value, className }: { value: 1 | 2 | 3 | 4 | 5 | 6; className: string }) {
  const pips = PIP_LAYOUT[value];
  return (
    <div className={className} aria-hidden>
      <div className="serve-setup-dice-pips">
        {pips.map((on, i) => (
          <span key={i} className={on ? 'serve-setup-dice-pip' : 'serve-setup-dice-pip serve-setup-dice-pip--off'} />
        ))}
      </div>
    </div>
  );
}

export function ServeSetupDiceButton({ onRoll, disabled }: ServeSetupDiceButtonProps) {
  const { t } = useTranslation();
  const [rolling, setRolling] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled || rolling) return;
    setRolling(true);
    window.setTimeout(() => {
      onRoll();
      setRolling(false);
    }, 520);
  }, [disabled, onRoll, rolling]);

  return (
    <>
      <style>{`
        .serve-setup-dice-btn {
          width: 2.75rem;
          height: 2.75rem;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(145deg, #fff 0%, #f3f4f6 100%);
          border: 1px solid rgb(209 213 219 / 0.9);
          box-shadow:
            0 1px 2px rgb(0 0 0 / 0.06),
            inset 0 1px 0 rgb(255 255 255 / 0.9);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .serve-setup-dice-btn:not(:disabled):active {
          transform: scale(0.94);
        }
        .serve-setup-dice-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        :is(.dark) .serve-setup-dice-btn {
          background: linear-gradient(145deg, #374151 0%, #1f2937 100%);
          border-color: rgb(75 85 99 / 0.9);
          box-shadow:
            0 1px 2px rgb(0 0 0 / 0.35),
            inset 0 1px 0 rgb(255 255 255 / 0.08);
        }
        .serve-setup-dice-scene {
          width: 1.35rem;
          height: 1.35rem;
          perspective: 5.5rem;
        }
        .serve-setup-dice-cube {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
          animation: serve-setup-dice-idle 5.5s ease-in-out infinite;
        }
        .serve-setup-dice-cube--roll {
          animation: serve-setup-dice-roll 0.52s ease-out forwards;
        }
        @keyframes serve-setup-dice-idle {
          0% { transform: rotateX(-22deg) rotateY(12deg); }
          50% { transform: rotateX(22deg) rotateY(192deg); }
          100% { transform: rotateX(-22deg) rotateY(372deg); }
        }
        @keyframes serve-setup-dice-roll {
          from { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          to { transform: rotateX(630deg) rotateY(900deg) rotateZ(120deg); }
        }
        .serve-setup-dice-face {
          position: absolute;
          inset: 0;
          border-radius: 0.2rem;
          background: #fff;
          border: 1px solid rgb(209 213 219 / 0.85);
          box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.5);
          backface-visibility: hidden;
        }
        :is(.dark) .serve-setup-dice-face {
          background: #f9fafb;
          border-color: rgb(107 114 128 / 0.7);
        }
        .serve-setup-dice-pips {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.05rem;
          width: 100%;
          height: 100%;
          padding: 0.14rem;
          box-sizing: border-box;
        }
        .serve-setup-dice-pip {
          width: 0.2rem;
          height: 0.2rem;
          border-radius: 9999px;
          background: rgb(37 99 235);
          place-self: center;
        }
        .serve-setup-dice-pip--off {
          visibility: hidden;
        }
        .serve-setup-dice-face--front { transform: translateZ(0.68rem); }
        .serve-setup-dice-face--back { transform: rotateY(180deg) translateZ(0.68rem); }
        .serve-setup-dice-face--right { transform: rotateY(90deg) translateZ(0.68rem); }
        .serve-setup-dice-face--left { transform: rotateY(-90deg) translateZ(0.68rem); }
        .serve-setup-dice-face--top { transform: rotateX(90deg) translateZ(0.68rem); }
        .serve-setup-dice-face--bottom { transform: rotateX(-90deg) translateZ(0.68rem); }
      `}</style>
      <button
        type="button"
        className="serve-setup-dice-btn"
        aria-label={t('gameDetails.liveScoring.serveSetupRandomizeA11y')}
        disabled={disabled || rolling}
        onClick={handleClick}
      >
        <div className="serve-setup-dice-scene">
          <div className={`serve-setup-dice-cube${rolling ? ' serve-setup-dice-cube--roll' : ''}`}>
            {(Object.keys(FACE_VALUES) as Array<keyof typeof FACE_VALUES>).map((face) => (
              <DiceFace
                key={face}
                value={FACE_VALUES[face]}
                className={`serve-setup-dice-face serve-setup-dice-face--${face}`}
              />
            ))}
          </div>
        </div>
      </button>
    </>
  );
}
