import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Cropper from 'react-easy-crop';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { lightHaptic } from '@/utils/lightHaptic';
import { cropToStoryCanvas } from '../utils/cropToStoryCanvas';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../utils/transform';

type PhotoStoryCropScreenProps = {
  imageUrl: string;
  onConfirm: (result: {
    file: File;
    previewUrl: string;
    naturalWidth: number;
    naturalHeight: number;
  }) => void;
  onCancel: () => void;
};

const STORY_ASPECT = STORY_CANVAS_WIDTH / STORY_CANVAS_HEIGHT;

export function PhotoStoryCropScreen({ imageUrl, onConfirm, onCancel }: PhotoStoryCropScreenProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
  }, [imageUrl]);

  const handleConfirm = useCallback(async () => {
    if (!area || busy) return;
    setBusy(true);
    try {
      const { file, width, height } = await cropToStoryCanvas(imageUrl, area);
      const previewUrl = URL.createObjectURL(file);
      lightHaptic();
      onConfirm({ file, previewUrl, naturalWidth: width, naturalHeight: height });
    } catch {
      toast.error(t('stories.editor.cropFailed'));
    } finally {
      setBusy(false);
    }
  }, [area, busy, imageUrl, onConfirm, t]);

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-30 flex flex-col bg-zinc-950"
    >
      <div className="relative flex-1 min-h-0">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={STORY_ASPECT}
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>
      <div className="flex gap-3 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => void handleConfirm()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin mx-auto" size={20} /> : t('common.done')}
        </Button>
      </div>
    </div>
  );
}
