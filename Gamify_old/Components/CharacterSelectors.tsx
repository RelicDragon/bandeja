import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface GameData {
  races: Array<{
    race: string;
    classes: Array<{
      class: string;
      model: string;
      modelType: string;
      anim_idle: string;
      anim_idle_boring?: string[];
    }>;
  }>;
}

interface CharacterSelectorsProps {
  gameData: GameData;
  selectedRace: string;
  selectedClass: string;
  onRaceChange: (race: string) => void;
  onClassChange: (className: string) => void;
  isModelLoading?: boolean;
  isExpanded?: boolean;
}

export const CharacterSelectors = ({
  gameData,
  selectedRace,
  selectedClass,
  onRaceChange,
  onClassChange,
  isModelLoading = false,
  isExpanded = true,
}: CharacterSelectorsProps) => {
  const selectedRaceData = gameData.races.find(r => r.race === selectedRace);

  useEffect(() => {
    if (selectedRaceData && selectedRaceData.classes.length > 0) {
      const hasClass = selectedRaceData.classes.find(c => c.class === selectedClass);
      if (!hasClass) {
        onClassChange(selectedRaceData.classes[0].class);
      }
    }
  }, [selectedRace, selectedRaceData, selectedClass, onClassChange]);

  return (
    <>
      <div className={`hero-stats-panel pointer-events-auto ${isExpanded ? 'panel-expanded' : 'panel-collapsed'}`}>
        {isModelLoading && (
          <div className="loading-indicator">
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            <span>Loading model...</span>
          </div>
        )}

        <div className={`panel-content ${isExpanded ? '' : 'hidden'}`}>
          <div className="selection-section">
            <label className="section-label">Race</label>
            <div className="button-grid">
              {gameData.races.map((race) => (
                <button
                  key={race.race}
                  onClick={() => onRaceChange(race.race)}
                  disabled={isModelLoading}
                  className={`jewel-button ${
                    selectedRace === race.race ? 'jewel-button-active' : ''
                  } ${isModelLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {race.race}
                </button>
              ))}
            </div>
          </div>

          <div className="selection-section">
            <label className="section-label">Class</label>
            <div className="button-grid">
              {selectedRaceData?.classes.map((classData) => (
                <button
                  key={classData.class}
                  onClick={() => onClassChange(classData.class)}
                  disabled={isModelLoading}
                  className={`jewel-button ${
                    selectedClass === classData.class ? 'jewel-button-active' : ''
                  } ${isModelLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {classData.class}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .ui-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: grid;
          grid-template-columns: 1fr 300px;
          padding-top: max(40px, env(safe-area-inset-top));
          padding-right: max(40px, env(safe-area-inset-right));
          padding-bottom: max(40px, env(safe-area-inset-bottom));
          padding-left: max(40px, env(safe-area-inset-left));
          gap: 20px;
        }

        @media (max-width: 768px) {
          .ui-container {
            grid-template-columns: 1fr;
            padding-top: max(20px, env(safe-area-inset-top));
            padding-right: max(20px, env(safe-area-inset-right));
            padding-bottom: max(20px, env(safe-area-inset-bottom));
            padding-left: max(20px, env(safe-area-inset-left));
          }
        }

        .hero-stats-panel {
          pointer-events: auto;
          background: rgba(20, 20, 20, 0.8);
          border: 4px solid #4a3b2a;
          box-shadow: inset 0 0 20px #000, 0 0 30px rgba(0, 0, 0, 0.8);
          color: #ebdcb2;
          font-family: 'Georgia', 'Times New Roman', serif;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          align-self: end;
          max-height: calc(100vh - 80px);
          overflow-y: auto;
          transition: max-height 0.3s ease, padding 0.3s ease;
        }

        .panel-collapsed {
          max-height: 60px;
          padding: 12px 24px;
          overflow: hidden;
        }

        .panel-content {
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .panel-content.hidden {
          opacity: 0;
          transform: translateY(-10px);
          pointer-events: none;
        }

        .loading-indicator {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid #4a3b2a;
          border-radius: 4px;
          color: #ebdcb2;
          font-size: 14px;
        }

        .selection-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .section-label {
          font-size: 16px;
          font-weight: bold;
          color: #ebdcb2;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .button-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .jewel-button {
          background: linear-gradient(135deg, #1a1410 0%, #0f0a08 100%);
          border: 2px solid #4a3020;
          border-radius: 4px;
          padding: 12px 16px;
          color: #d4af37;
          font-weight: 600;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.6),
            inset 0 1px 2px rgba(255, 215, 0, 0.1);
          font-family: inherit;
        }

        .jewel-button::before {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          right: 2px;
          height: 50%;
          background: linear-gradient(180deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%);
          border-radius: 2px;
          pointer-events: none;
        }

        .jewel-button:hover:not(:disabled) {
          border-color: #6a5030;
          box-shadow: 
            0 4px 12px rgba(212, 175, 55, 0.3),
            inset 0 1px 2px rgba(255, 215, 0, 0.2);
          transform: translateY(-1px);
        }

        .jewel-button-active {
          background: linear-gradient(135deg, #2a2010 0%, #1f1808 100%);
          border-color: #d4af37;
          color: #ffd700;
          box-shadow: 
            0 0 20px rgba(212, 175, 55, 0.5),
            inset 0 2px 4px rgba(255, 215, 0, 0.3),
            0 4px 12px rgba(0, 0, 0, 0.6);
        }

        .jewel-button-active::after {
          content: '';
          position: absolute;
          inset: -3px;
          background: radial-gradient(circle at 50% 0%, rgba(212, 175, 55, 0.3), transparent 70%);
          border-radius: 6px;
          z-index: -1;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
        }

        @media (min-width: 640px) {
          .jewel-button {
            font-size: 16px;
            padding: 14px 20px;
          }
        }
      `}</style>
    </>
  );
};
