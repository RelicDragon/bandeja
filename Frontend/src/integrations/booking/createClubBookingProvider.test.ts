import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import {
  createClubBookingProvider,
  createHydratedClubBookingProvider,
} from './createClubBookingProvider';
import { BooktimeClubBookingProvider } from './providers/BooktimeClubBookingProvider';
import { PadelooClubBookingProvider } from './providers/PadelooClubBookingProvider';
import { KlikterenClubBookingProvider } from './providers/KlikterenClubBookingProvider';

const booktimeClub: Club = {
  id: 'club-bt',
  name: 'Booktime Club',
  address: '',
  cityId: 'city-1',
  integrationType: 'BOOKTIME',
  integrationConfig: { companyId: 'company-uuid' },
  courts: [],
};

const padelooClub: Club = {
  id: 'club-pd',
  name: 'Padeloo Club',
  address: '',
  cityId: 'city-1',
  integrationType: 'PADELOO',
  integrationConfig: { clubId: 2 },
  courts: [],
};

const klikterenClub: Club = {
  id: 'club-kt',
  name: 'Klikteren Club',
  address: '',
  cityId: 'city-1',
  integrationType: 'KLIKTEREN',
  integrationConfig: { venueId: '05cdc4d3-03fd-4f2c-af65-9b2018b5a53e' },
  courts: [],
};

describe('createClubBookingProvider', () => {
  it('returns scout Booktime provider for booktime clubs', () => {
    const provider = createClubBookingProvider(booktimeClub, 'scout');
    expect(provider).toBeInstanceOf(BooktimeClubBookingProvider);
  });

  it('returns scout Padeloo provider for padeloo clubs', () => {
    const provider = createClubBookingProvider(padelooClub, 'scout');
    expect(provider).toBeInstanceOf(PadelooClubBookingProvider);
  });

  it('returns scout Klikteren provider for klikteren clubs', () => {
    const provider = createClubBookingProvider(klikterenClub, 'scout');
    expect(provider).toBeInstanceOf(KlikterenClubBookingProvider);
  });

  it('returns null for hydrated booktime (async path required)', () => {
    expect(createClubBookingProvider(booktimeClub, 'hydrated')).toBeNull();
  });

  it('returns null when integration config is missing', () => {
    const broken: Club = { ...padelooClub, integrationConfig: null };
    expect(createClubBookingProvider(broken, 'scout')).toBeNull();
  });

  it('returns null when klikteren venueId is missing', () => {
    const broken: Club = { ...klikterenClub, integrationConfig: null };
    expect(createClubBookingProvider(broken, 'scout')).toBeNull();
  });
});

describe('createHydratedClubBookingProvider', () => {
  it('returns null without network when booktime session cannot hydrate in test env', async () => {
    const provider = await createHydratedClubBookingProvider({
      ...booktimeClub,
      integrationConfig: null,
    });
    expect(provider).toBeNull();
  });

  it('returns null for padeloo club without padeloo club id', async () => {
    const provider = await createHydratedClubBookingProvider({
      ...padelooClub,
      integrationConfig: null,
    });
    expect(provider).toBeNull();
  });

  it('returns null for klikteren club without venueId', async () => {
    const provider = await createHydratedClubBookingProvider({
      ...klikterenClub,
      integrationConfig: null,
    });
    expect(provider).toBeNull();
  });
});
