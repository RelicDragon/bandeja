import { get, set } from 'idb-keyval';

const CONTACTS_VISIBILITY_KEY = 'padelpulse-contacts-visibility';

export const getContactsVisibility = async (): Promise<boolean> => {
  const visibility = await get<boolean>(CONTACTS_VISIBILITY_KEY);
  return visibility ?? false;
};

export const setContactsVisibility = async (visible: boolean): Promise<void> => {
  await set(CONTACTS_VISIBILITY_KEY, visible);
};

