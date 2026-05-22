import { describe, expect, it } from 'vitest';
import {
  PICKLEBALL_HALF_COURT_FT,
  PICKLEBALL_HALF_COURT_UNITS,
  PICKLEBALL_NET_Y,
  PICKLEBALL_NVZ_DEPTH_FT,
  pickleballNvzLineY,
  pickleballNvzOffsetFromNet,
} from './pickleballCourtGeometry';

describe('pickleballCourtGeometry', () => {
  it('places NVZ lines at 7ft of 22ft half-court from the net', () => {
    const offset = pickleballNvzOffsetFromNet();
    expect(offset).toBeCloseTo((PICKLEBALL_NVZ_DEPTH_FT / PICKLEBALL_HALF_COURT_FT) * PICKLEBALL_HALF_COURT_UNITS);
    expect(pickleballNvzLineY('top')).toBeCloseTo(PICKLEBALL_NET_Y - offset);
    expect(pickleballNvzLineY('bottom')).toBeCloseTo(PICKLEBALL_NET_Y + offset);
  });

  it('keeps top and bottom kitchen lines symmetric around the net', () => {
    const top = pickleballNvzLineY('top');
    const bottom = pickleballNvzLineY('bottom');
    expect(top + bottom).toBeCloseTo(PICKLEBALL_NET_Y * 2);
    expect(bottom - top).toBeCloseTo(pickleballNvzOffsetFromNet() * 2);
  });
});
