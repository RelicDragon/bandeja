import type { Sport } from '@prisma/client';

export type StickerManifestItem = {
  slug: string;
  emoji: string;
  title: string;
  /**
   * Relative path under Fluent UI Emoji assets/ (3D PNG).
   * Source: https://github.com/microsoft/fluentui-emoji (MIT)
   */
  fluentPath: string;
  /** When true, generator also writes `{slug}.anim.webp` */
  animated?: boolean;
};

export type PackManifest = {
  slug: string;
  title: string;
  sport: Sport | null;
  sortOrder: number;
  coverSlug: string;
  stickers: StickerManifestItem[];
};

/** Official packs — source of truth for generate + seed. 32 Fluent 3D stickers. */
export const OFFICIAL_PACK_MANIFESTS: PackManifest[] = [
  {
    slug: 'reactions',
    title: 'Reactions',
    sport: null,
    sortOrder: 0,
    coverSlug: 'lol',
    stickers: [
      {
        slug: 'lol',
        emoji: '😂',
        title: 'Lol',
        fluentPath: 'Face with tears of joy/3D/face_with_tears_of_joy_3d.png',
        animated: true,
      },
      { slug: 'fire', emoji: '🔥', title: 'Fire', fluentPath: 'Fire/3D/fire_3d.png' },
      { slug: 'heart', emoji: '❤️', title: 'Heart', fluentPath: 'Red heart/3D/red_heart_3d.png' },
      {
        slug: 'thumbs',
        emoji: '👍',
        title: 'Thumbs up',
        fluentPath: 'Thumbs up/Default/3D/thumbs_up_3d_default.png',
      },
      {
        slug: 'clap',
        emoji: '👏',
        title: 'Clap',
        fluentPath: 'Clapping hands/Default/3D/clapping_hands_3d_default.png',
      },
      {
        slug: 'strong',
        emoji: '💪',
        title: 'Strong',
        fluentPath: 'Flexed biceps/Default/3D/flexed_biceps_3d_default.png',
      },
      { slug: 'trophy', emoji: '🏆', title: 'Trophy', fluentPath: 'Trophy/3D/trophy_3d.png' },
      {
        slug: 'hands',
        emoji: '🙌',
        title: 'Hands up',
        fluentPath: 'Raising hands/Default/3D/raising_hands_3d_default.png',
      },
      {
        slug: 'party',
        emoji: '🎉',
        title: 'Party',
        fluentPath: 'Party popper/3D/party_popper_3d.png',
        animated: true,
      },
      {
        slug: 'hundred',
        emoji: '💯',
        title: 'Hundred',
        fluentPath: 'Hundred points/3D/hundred_points_3d.png',
      },
      { slug: 'wink', emoji: '😉', title: 'Wink', fluentPath: 'Winking face/3D/winking_face_3d.png' },
      {
        slug: 'love',
        emoji: '😍',
        title: 'Love',
        fluentPath: 'Smiling face with heart-eyes/3D/smiling_face_with_heart-eyes_3d.png',
      },
      {
        slug: 'cool',
        emoji: '😎',
        title: 'Cool',
        fluentPath: 'Smiling face with sunglasses/3D/smiling_face_with_sunglasses_3d.png',
      },
      {
        slug: 'think',
        emoji: '🤔',
        title: 'Think',
        fluentPath: 'Thinking face/3D/thinking_face_3d.png',
      },
      {
        slug: 'cry',
        emoji: '😭',
        title: 'Cry',
        fluentPath: 'Loudly crying face/3D/loudly_crying_face_3d.png',
      },
      {
        slug: 'ok',
        emoji: '👌',
        title: 'OK',
        fluentPath: 'Ok hand/Default/3D/ok_hand_3d_default.png',
      },
    ],
  },
  {
    slug: 'padel',
    title: 'Padel',
    sport: 'PADEL',
    sortOrder: 1,
    coverSlug: 'smash',
    stickers: [
      { slug: 'ball', emoji: '🎾', title: 'Ball', fluentPath: 'Tennis/3D/tennis_3d.png', animated: true },
      {
        slug: 'smash',
        emoji: '💥',
        title: 'Smash',
        fluentPath: 'Collision/3D/collision_3d.png',
        animated: true,
      },
      { slug: 'ace', emoji: '🎯', title: 'Ace', fluentPath: 'Bullseye/3D/bullseye_3d.png' },
      {
        slug: 'volley',
        emoji: '🤚',
        title: 'Volley',
        fluentPath: 'Raised hand/Default/3D/raised_hand_3d_default.png',
      },
      {
        slug: 'lob',
        emoji: '🌤️',
        title: 'Lob',
        fluentPath: 'Sun behind small cloud/3D/sun_behind_small_cloud_3d.png',
      },
      {
        slug: 'bandeja',
        emoji: '🍽️',
        title: 'Bandeja',
        fluentPath: 'Fork and knife with plate/3D/fork_and_knife_with_plate_3d.png',
      },
      { slug: 'vibora', emoji: '🐍', title: 'Víbora', fluentPath: 'Snake/3D/snake_3d.png' },
      { slug: 'glass', emoji: '🪟', title: 'Glass', fluentPath: 'Window/3D/window_3d.png' },
      { slug: 'net', emoji: '🥅', title: 'Net', fluentPath: 'Goal net/3D/goal_net_3d.png' },
      { slug: 'partner', emoji: '🤝', title: 'Partner', fluentPath: 'Handshake/3D/handshake_3d.png' },
      {
        slug: 'warmup',
        emoji: '🏃',
        title: 'Warm-up',
        fluentPath: 'Person running/Default/3D/person_running_3d_default.png',
      },
      {
        slug: 'matchpoint',
        emoji: '⚡',
        title: 'Match point',
        fluentPath: 'High voltage/3D/high_voltage_3d.png',
        animated: true,
      },
      { slug: 'gg', emoji: '✨', title: 'GG', fluentPath: 'Sparkles/3D/sparkles_3d.png' },
      { slug: 'out', emoji: '🚫', title: 'Out', fluentPath: 'Prohibited/3D/prohibited_3d.png' },
      { slug: 'letsgo', emoji: '🚀', title: "Let's go", fluentPath: 'Rocket/3D/rocket_3d.png' },
      {
        slug: 'medal',
        emoji: '🏅',
        title: 'Medal',
        fluentPath: 'Sports medal/3D/sports_medal_3d.png',
      },
    ],
  },
];

export const STATIC_ASSET_FILENAME = (slug: string) => `${slug}.webp`;
export const ANIMATED_ASSET_FILENAME = (slug: string) => `${slug}.anim.webp`;

export const FLUENT_EMOJI_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@latest/assets/';
