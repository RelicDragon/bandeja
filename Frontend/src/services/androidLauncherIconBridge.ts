import { registerPlugin } from '@capacitor/core';

export interface AndroidLauncherIconChangeOptions {
  name: string;
  disable: string[];
}

interface LauncherIconPlugin {
  getName(): Promise<{ value: string | null }>;
  change(options: AndroidLauncherIconChangeOptions): Promise<void>;
}

const LauncherIcon = registerPlugin<LauncherIconPlugin>('LauncherIcon');

export const getAndroidLauncherIconName = () => LauncherIcon.getName();

export const changeAndroidLauncherIcon = (options: AndroidLauncherIconChangeOptions) =>
  LauncherIcon.change(options);
