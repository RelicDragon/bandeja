import { useState, useEffect, Suspense, useRef, useCallback, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Sparkles, ContactShadows, Html } from '@react-three/drei';
import { CharacterModal } from '../Components/CharacterModal';
import { CharacterSelectors } from '../Components/CharacterSelectors';
import { Effects } from '../Components/Effects';
import { usePreloadModels } from '../hooks/usePreloadModels';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from 'react-i18next';
import { Loader2, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBackNavigation } from '@/utils/navigation';
import { useNavigationStore } from '@/store/navigationStore';
import * as THREE from 'three';

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

function LoadingSpinner() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        <span className="text-amber-200 text-sm font-medium">Loading character...</span>
      </div>
    </Html>
  );
}

function SceneWrapper({ 
  children, 
  onModelRef 
}: { 
  children: React.ReactNode; 
  onModelRef: (ref: THREE.Group | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    onModelRef(groupRef.current);
  }, [onModelRef]);

  return <group ref={groupRef} position={[0, -1, 0]}>{children}</group>;
}

function CameraController({ modelRef }: { modelRef: THREE.Group | null }) {
  const controlsRef = useRef<any>(null);
  const defaultTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame(() => {
    if (!controlsRef.current) return;

    let targetVec = defaultTarget;
    
    if (modelRef) {
      const box = new THREE.Box3().setFromObject(modelRef);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        targetVec = center;
      }
    }

    controlsRef.current.target.lerp(targetVec, 0.1);
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={3}
      maxDistance={8}
      maxPolarAngle={Math.PI / 2}
    />
  );
}

export const CharCreation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { setCurrentPage, setIsAnimating } = useNavigationStore();
  const { isPreloading, preloadProgress } = usePreloadModels();
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [isLoadingGameData, setIsLoadingGameData] = useState(true);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [previousModelPath, setPreviousModelPath] = useState<string>('');
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [modelGroupRef, setModelGroupRef] = useState<THREE.Group | null>(null);

  useBackButtonHandler();

  const handleBackClick = () => {
    setIsAnimating(true);
    
    handleBackNavigation({
      pathname: location.pathname,
      locationState: location.state as { fromLeagueSeasonGameId?: string; fromPage?: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions' } | null,
      navigate,
      setCurrentPage,
    });
    
    setTimeout(() => setIsAnimating(false), 300);
  };

  useEffect(() => {
    setIsLoadingGameData(true);
    fetch('/game_data.json')
      .then(res => res.json())
      .then((data: GameData) => {
        setGameData(data);
        if (data.races.length > 0) {
          const firstRace = data.races[0];
          setSelectedRace(firstRace.race);
          if (firstRace.classes.length > 0) {
            setSelectedClass(firstRace.classes[0].class);
          }
        }
      })
      .catch(err => console.error('Failed to load game data:', err))
      .finally(() => setIsLoadingGameData(false));
  }, []);

  const selectedClassData = useMemo(() => {
    return gameData?.races
      .find(r => r.race === selectedRace)
      ?.classes.find(c => c.class === selectedClass);
  }, [gameData, selectedRace, selectedClass]);

  const currentModelPath = useMemo(() => {
    return selectedClassData ? `/${selectedClassData.model}` : '';
  }, [selectedClassData]);

  const idleBoringAnimations = useMemo(() => {
    return selectedClassData?.anim_idle_boring || [];
  }, [selectedClassData]);

  useEffect(() => {
    if (currentModelPath && currentModelPath !== previousModelPath) {
      setIsModelLoading(true);
      setPreviousModelPath(currentModelPath);
    }
  }, [currentModelPath, previousModelPath]);

  const handleModelLoad = useCallback(() => {
    setIsModelLoading(false);
  }, []);

  const isLoading = isLoadingGameData || isPreloading;

  if (isLoading) {
    return (
      <div
        className="fixed inset-0 bg-black flex items-center justify-center"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
          <span className="text-amber-200 text-lg font-medium">
            {isPreloading ? `Loading models... ${Math.round(preloadProgress)}%` : 'Loading character creation...'}
          </span>
          {isPreloading && (
            <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${preloadProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const fullName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';

  return (
    <div className="fixed inset-0 bg-black">
      <div className="wc3-header">
        <button
          onClick={handleBackClick}
          className="wc3-back-button"
        >
          <ArrowLeft size={18} />
          {t('common.back')}
        </button>
        {fullName && (
          <div className="wc3-name-display">
            {fullName}
          </div>
        )}
      </div>

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 1.5, 5]} fov={35} />
        
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', 5, 15]} />
        
        <ambientLight intensity={0.2} />
        <spotLight 
          position={[5, 5, 5]} 
          angle={0.15} 
          penumbra={1} 
          intensity={2} 
          castShadow 
        />
        <pointLight 
          position={[-5, 2, -2]} 
          color="blue" 
          intensity={1} 
        />

        <SceneWrapper onModelRef={setModelGroupRef}>
          {selectedClassData ? (
            <Suspense fallback={<LoadingSpinner />}>
              <CharacterModal 
                key={currentModelPath}
                modelPath={currentModelPath}
                animationName={selectedClassData.anim_idle}
                idleBoringAnimations={idleBoringAnimations}
                onLoad={handleModelLoad}
              />
            </Suspense>
          ) : null}
          
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[2, 32]} />
            <meshStandardMaterial color="#111" roughness={0.8} />
          </mesh>
          
          <ContactShadows 
            opacity={0.5} 
            scale={10} 
            blur={2} 
            far={10} 
            resolution={256} 
            color="#000" 
          />
        </SceneWrapper>

        <Sparkles 
          count={100} 
          scale={5} 
          size={2} 
          speed={0.4} 
          opacity={0.2} 
          color="#ffcc00" 
        />
        
        <Environment preset="night" />
        <CameraController modelRef={modelGroupRef} />
        <Effects />
      </Canvas>

      {gameData && (
        <div className="ui-container">
          <div className="panel-wrapper">
            <button
              onClick={() => setIsPanelExpanded(!isPanelExpanded)}
              className="panel-toggle"
              aria-label={isPanelExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {isPanelExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>
            <CharacterSelectors
              gameData={gameData}
              selectedRace={selectedRace}
              selectedClass={selectedClass}
              onRaceChange={setSelectedRace}
              onClassChange={setSelectedClass}
              isModelLoading={isModelLoading}
              isExpanded={isPanelExpanded}
            />
          </div>
        </div>
      )}

      <style>{`
        .wc3-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: calc(70px + env(safe-area-inset-top));
          z-index: 50;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: env(safe-area-inset-top) max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left));
          background: rgba(20, 20, 20, 0.95);
          border-bottom: 4px solid #4a3b2a;
          box-shadow: 
            inset 0 0 20px #000, 
            0 4px 20px rgba(0, 0, 0, 0.8),
            0 0 30px rgba(212, 175, 55, 0.2);
        }

        .wc3-back-button {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #1a1410 0%, #0f0a08 100%);
          border: 2px solid #4a3020;
          border-radius: 4px;
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
          font-family: 'Georgia', 'Times New Roman', serif;
        }

        .wc3-back-button::before {
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

        .wc3-back-button:hover {
          border-color: #6a5030;
          box-shadow: 
            0 4px 12px rgba(212, 175, 55, 0.3),
            inset 0 1px 2px rgba(255, 215, 0, 0.2);
          transform: translateY(-1px);
          color: #ffd700;
        }

        .wc3-name-display {
          pointer-events: auto;
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          color: #ebdcb2;
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 18px;
          font-weight: bold;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .panel-wrapper {
          position: relative;
          align-self: end;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .panel-toggle {
          pointer-events: auto;
          background: rgba(20, 20, 20, 0.8);
          border: 2px solid #4a3b2a;
          border-bottom: none;
          border-radius: 8px 8px 0 0;
          padding: 8px 16px;
          color: #ebdcb2;
          cursor: pointer;
          transition: all 0.2s ease;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.5);
        }

        .panel-toggle:hover {
          background: rgba(30, 30, 30, 0.9);
          border-color: #6a5030;
          color: #ffd700;
        }
      `}</style>
    </div>
  );
};
