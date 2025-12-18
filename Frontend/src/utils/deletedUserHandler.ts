import i18n from '@/i18n/config';

const DELETED_USER_MARKER = '###DELETED';

function processDeletedUser(obj: any): any {
  if (obj.firstName === DELETED_USER_MARKER) {
    return {
      ...obj,
      firstName: i18n.t('common.deleted'),
      lastName: i18n.t('common.user'),
    };
  }
  return obj;
}

export function processDeletedUsers(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => processDeletedUsers(item));
  }

  if (typeof data === 'object') {
    const processed = processDeletedUser(data);
    
    const result: any = {};
    for (const key in processed) {
      if (Object.prototype.hasOwnProperty.call(processed, key)) {
        result[key] = processDeletedUsers(processed[key]);
      }
    }
    return result;
  }

  return data;
}
