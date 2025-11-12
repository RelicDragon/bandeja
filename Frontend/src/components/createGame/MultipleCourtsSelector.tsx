import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, X, Edit3, Save, Home } from 'lucide-react';
import { Card } from '@/components';
import { Court, EntityType } from '@/types';
import { gameCourtsApi, GameCourt } from '@/api/gameCourts';
import { CourtModal } from '@/components/CourtModal';

interface MultipleCourtsSelectorProps {
  gameId?: string;
  courts: Court[];
  selectedClub: string;
  entityType: EntityType;
  isEditing?: boolean;
  initialGameCourts?: GameCourt[];
  onCourtsChange?: (courtIds: string[]) => void;
  onSave?: () => void | Promise<void>;
}

export const MultipleCourtsSelector = ({
  gameId,
  courts,
  selectedClub,
  entityType,
  isEditing = true,
  initialGameCourts = [],
  onCourtsChange,
  onSave,
}: MultipleCourtsSelectorProps) => {
  const { t } = useTranslation();
  const [gameCourts, setGameCourts] = useState<GameCourt[]>(initialGameCourts);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(!gameId);
  const [isClosingEditMode, setIsClosingEditMode] = useState(false);
  const [editGameCourts, setEditGameCourts] = useState<GameCourt[]>([]);
  const [removingCourtId, setRemovingCourtId] = useState<string | null>(null);
  const [addingCourtId, setAddingCourtId] = useState<string | null>(null);
  const [movingCourtId, setMovingCourtId] = useState<string | null>(null);
  const [positionOffsets, setPositionOffsets] = useState<Record<string, number>>({});
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousOrderRef = useRef<string[]>([]);
  const isAnimatingRef = useRef(false);

  const initialGameCourtsIdsRef = useRef<string>('');
  const gameIdRef = useRef<string | undefined>(gameId);

  useEffect(() => {
    const gameIdChanged = gameIdRef.current !== gameId;
    gameIdRef.current = gameId;
    
    if (gameId && initialGameCourts.length === 0 && gameIdChanged) {
      gameCourtsApi.getByGameId(gameId).then((response) => {
        setGameCourts(response.data);
      }).catch((error) => {
        console.error('Failed to fetch game courts:', error);
      });
    } else if (initialGameCourts.length > 0) {
      const currentIds = initialGameCourts.map(gc => gc.id).join(',');
      const previousIds = initialGameCourtsIdsRef.current;
      
      if (currentIds !== previousIds) {
        initialGameCourtsIdsRef.current = currentIds;
        setGameCourts(initialGameCourts);
      }
    }
  }, [gameId, initialGameCourts]);

  useEffect(() => {
    if (isEditMode && gameId) {
      setEditGameCourts([...gameCourts]);
      previousOrderRef.current = gameCourts.map(gc => gc.id);
      setPositionOffsets({});
      isAnimatingRef.current = false;
    }
  }, [isEditMode, gameCourts, gameId]);


  const availableCourts = courts.filter(
    (court) => !editGameCourts.some((gc) => gc.courtId === court.id)
  );

  const handleAddCourt = (courtId: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court) return;

    const newGameCourt: GameCourt = {
      id: `temp-${Date.now()}`,
      gameId: gameId || '',
      courtId: court.id,
      order: editGameCourts.length + 1,
      court: court,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedCourts = [...editGameCourts, newGameCourt];
    setAddingCourtId(newGameCourt.id);
    setEditGameCourts(updatedCourts);
    setIsCourtModalOpen(false);
    
    if (!gameId) {
      const courtIds = updatedCourts.map((gc) => gc.courtId);
      onCourtsChange?.(courtIds);
    }
    
    setTimeout(() => {
      setAddingCourtId(null);
    }, 500);
  };

  const handleRemoveCourt = (gameCourtId: string) => {
    if (isEditMode) {
      setRemovingCourtId(gameCourtId);
      setTimeout(() => {
        const updatedCourts = editGameCourts.filter((gc) => gc.id !== gameCourtId);
        setEditGameCourts(updatedCourts);
        setRemovingCourtId(null);
        
        if (!gameId) {
          const courtIds = updatedCourts.map((gc) => gc.courtId);
          onCourtsChange?.(courtIds);
        }
      }, 400);
    } else if (gameId && !gameCourtId.startsWith('temp-')) {
      setRemovingCourtId(gameCourtId);
      gameCourtsApi.removeGameCourt(gameId, gameCourtId).then(() => {
        setTimeout(() => {
          setGameCourts(gameCourts.filter((gc) => gc.id !== gameCourtId));
          setRemovingCourtId(null);
        }, 400);
      }).catch((error) => {
        console.error('Failed to remove game court:', error);
        setRemovingCourtId(null);
      });
    } else {
      setRemovingCourtId(gameCourtId);
      setTimeout(() => {
        const updatedCourts = gameCourts.filter((gc) => gc.id !== gameCourtId);
        if (gameId) {
          setGameCourts(updatedCourts);
        }
        setRemovingCourtId(null);
        
        if (!gameId) {
          const courtIds = updatedCourts.map((gc) => gc.courtId);
          onCourtsChange?.(courtIds);
        }
      }, 400);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0 || isAnimatingRef.current) return;
    const courtToMove = editGameCourts[index];
    const courtToSwap = editGameCourts[index - 1];
    setMovingCourtId(courtToMove.id);
    
    isAnimatingRef.current = true;
    
    const itemHeight = itemRefs.current[courtToMove.id]?.offsetHeight || itemRefs.current[courtToSwap.id]?.offsetHeight || 60;
    const gap = 8;
    const offset = itemHeight + gap;
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const offsets: Record<string, number> = {
          [courtToSwap.id]: offset,
          [courtToMove.id]: -offset,
        };
        
        setPositionOffsets(offsets);
        
        setTimeout(() => {
          setIsUpdatingOrder(true);
          setPositionOffsets({});
          
          requestAnimationFrame(() => {
            const newCourts = [...editGameCourts];
            [newCourts[index - 1], newCourts[index]] = [newCourts[index], newCourts[index - 1]];
            newCourts.forEach((gc, i) => {
              gc.order = i + 1;
            });
            
            setEditGameCourts(newCourts);
            previousOrderRef.current = newCourts.map(gc => gc.id);
            setMovingCourtId(null);
            
            if (!gameId) {
              const courtIds = newCourts.map((gc) => gc.courtId);
              onCourtsChange?.(courtIds);
            }
            
            requestAnimationFrame(() => {
              setIsUpdatingOrder(false);
              isAnimatingRef.current = false;
            });
          });
        }, 300);
      });
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === editGameCourts.length - 1 || isAnimatingRef.current) return;
    const courtToMove = editGameCourts[index];
    const courtToSwap = editGameCourts[index + 1];
    setMovingCourtId(courtToMove.id);
    
    isAnimatingRef.current = true;
    
    const itemHeight = itemRefs.current[courtToMove.id]?.offsetHeight || itemRefs.current[courtToSwap.id]?.offsetHeight || 60;
    const gap = 8;
    const offset = itemHeight + gap;
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const offsets: Record<string, number> = {
          [courtToSwap.id]: -offset,
          [courtToMove.id]: offset,
        };
        
        setPositionOffsets(offsets);
        
        setTimeout(() => {
          setIsUpdatingOrder(true);
          setPositionOffsets({});
          
          requestAnimationFrame(() => {
            const newCourts = [...editGameCourts];
            [newCourts[index], newCourts[index + 1]] = [newCourts[index + 1], newCourts[index]];
            newCourts.forEach((gc, i) => {
              gc.order = i + 1;
            });
            
            setEditGameCourts(newCourts);
            previousOrderRef.current = newCourts.map(gc => gc.id);
            setMovingCourtId(null);
            
            if (!gameId) {
              const courtIds = newCourts.map((gc) => gc.courtId);
              onCourtsChange?.(courtIds);
            }
            
            requestAnimationFrame(() => {
              setIsUpdatingOrder(false);
              isAnimatingRef.current = false;
            });
          });
        }, 300);
      });
    });
  };

  const handleSave = async () => {
    if (!gameId) {
      const courtIds = editGameCourts.map((gc) => gc.courtId);
      onCourtsChange?.(courtIds);
      setGameCourts(editGameCourts);
      return;
    }

    setIsSaving(true);
    try {
      const courtIds = editGameCourts.map((gc) => gc.courtId);
      const response = await gameCourtsApi.setGameCourts(gameId, courtIds);
      setGameCourts(response.data);
      setIsClosingEditMode(true);
      setTimeout(() => {
        setIsEditMode(false);
        setIsClosingEditMode(false);
      }, 400);
      if (onSave) {
        await onSave();
      }
    } catch (error) {
      console.error('Failed to save game courts:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsClosingEditMode(true);
    setTimeout(() => {
      setEditGameCourts([...gameCourts]);
      setIsEditMode(false);
      setIsClosingEditMode(false);
    }, 400);
  };

  const displayCourts = isEditMode ? editGameCourts : gameCourts;

  if (!selectedClub) {
    return null;
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('createGame.multipleCourts')}
            </h2>
          </div>
          {isEditing && gameId && (
            <div className="flex items-center gap-2">
              <button
                onClick={isEditMode ? handleCancel : () => setIsEditMode(true)}
                className={`p-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md ${
                  isEditMode
                    ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 border border-red-600 dark:border-red-600 shadow-red-100 dark:shadow-red-900/20 translate-x-0'
                    : 'bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 border border-primary-600 dark:border-primary-600 shadow-primary-100 dark:shadow-primary-900/20 translate-x-10'
                }`}
                title={isEditMode ? t('common.cancel') : t('common.edit')}
              >
                <div className="relative w-[18px] h-[18px]">
                  <X
                    size={18}
                    className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                      isEditMode
                        ? 'opacity-100 rotate-0 scale-100 text-white'
                        : 'opacity-0 rotate-90 scale-75'
                    }`}
                  />
                  <Edit3
                    size={18}
                    className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                      isEditMode
                        ? 'opacity-0 -rotate-90 scale-75'
                        : 'opacity-100 rotate-0 scale-100 text-white'
                    }`}
                  />
                </div>
              </button>
              
              <button
                onClick={handleSave}
                disabled={!isEditMode || isSaving}
                className={`p-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md shadow-green-200 dark:shadow-green-900/30 ${
                  isEditMode 
                    ? 'bg-green-600 hover:bg-green-700 opacity-100 scale-100 translate-x-0' 
                    : 'bg-green-600 hover:bg-green-700 opacity-0 scale-75 pointer-events-none -translate-x-10'
                }`}
                title={t('common.save')}
              >
                <Save size={18} className="text-white" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {displayCourts.length === 0 && !isEditMode ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
              {t('createGame.noCourtsSelected')}
            </p>
          ) : displayCourts.length > 0 ? (
            <div className="space-y-2 relative">
              {displayCourts.map((gameCourt, index) => {
                const isRemoving = removingCourtId === gameCourt.id;
                const isAdding = addingCourtId === gameCourt.id;
                const isMoving = movingCourtId === gameCourt.id;
                const offset = positionOffsets[gameCourt.id] || 0;
                
                return (
                <div
                  key={gameCourt.id}
                  ref={(el) => {
                    itemRefs.current[gameCourt.id] = el;
                  }}
                  className={`flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg transition-all duration-300 ease-in-out ${
                    isRemoving 
                      ? 'animate-bounce-out' 
                      : isAdding 
                        ? 'animate-bounce-in' 
                        : isMoving
                          ? 'scale-105 shadow-lg z-10'
                          : 'opacity-100'
                  }`}
                  style={{
                    transform: isRemoving 
                      ? 'translateX(-100%)' 
                      : offset !== 0
                        ? `translateY(${offset}px)`
                        : isMoving
                          ? 'scale(1.05) translateY(-2px)'
                          : 'translateX(0) translateY(0) scale(1)',
                    transition: isUpdatingOrder ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: isMoving ? 10 : offset !== 0 ? 5 : 1,
                  }}
                >
                  {isEditMode && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === displayCourts.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                      {gameCourt.court.name}
                      {gameCourt.court.isIndoor && (
                        <span title="Indoor court">
                          <Home size={14} className="text-gray-500 dark:text-gray-400" />
                        </span>
                      )}
                    </div>
                    {gameCourt.court.courtType && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {gameCourt.court.courtType}
                      </div>
                    )}
                  </div>
                  {isEditMode && (
                    <button
                      onClick={() => handleRemoveCourt(gameCourt.id)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
              })}
            </div>
          ) : null}

          {(!gameId || isEditMode || isClosingEditMode) && (
            <div className={`${isClosingEditMode ? 'animate-bounce-out' : 'animate-bounce-in'}`}>
              <button
                onClick={() => setIsCourtModalOpen(true)}
                disabled={availableCourts.length === 0}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                {t('createGame.addCourt')}
              </button>
            </div>
          )}
        </div>
      </Card>

      <CourtModal
        isOpen={isCourtModalOpen}
        onClose={() => setIsCourtModalOpen(false)}
        courts={availableCourts}
        selectedId=""
        onSelect={handleAddCourt}
        entityType={entityType}
        showNotBookedOption={false}
      />
    </>
  );
};

