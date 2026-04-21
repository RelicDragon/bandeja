import type { ComponentType } from 'react';
import { Moon, Sunrise, Sun, Sunset } from 'lucide-react';
import type { BucketId } from '@/utils/availability';

export const BUCKET_META: Record<
  BucketId,
  { Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; labelKey: string }
> = {
  night: { Icon: Moon, labelKey: 'profile.availability.buckets.night' },
  morning: { Icon: Sunrise, labelKey: 'profile.availability.buckets.morning' },
  afternoon: { Icon: Sun, labelKey: 'profile.availability.buckets.afternoon' },
  evening: { Icon: Sunset, labelKey: 'profile.availability.buckets.evening' },
};
