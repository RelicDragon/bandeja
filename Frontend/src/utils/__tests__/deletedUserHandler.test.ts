import { describe, expect, it } from 'vitest';
import { processDeletedUsers } from '../deletedUserHandler';

describe('processDeletedUsers', () => {
  it('preserves blob response bodies', () => {
    const blob = new Blob(['preview-image'], { type: 'image/webp' });

    expect(processDeletedUsers(blob)).toBe(blob);
  });

  it('still replaces deleted-user markers in JSON payloads', () => {
    const result = processDeletedUsers({
      sender: { firstName: '###DELETED', lastName: null },
    });

    expect(result.sender.firstName).not.toBe('###DELETED');
  });
});
