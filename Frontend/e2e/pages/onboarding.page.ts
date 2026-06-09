import { expect, type Page } from '@playwright/test';

export class OnboardingPage {
  constructor(private readonly page: Page) {}

  nameSetModal() {
    return this.page.getByText(/set your name/i);
  }

  nameFirstInput() {
    return this.page.getByLabel(/^first name$/i);
  }

  nameLastInput() {
    return this.page.getByLabel(/^last name$/i);
  }

  primarySportModal() {
    return this.page.getByText(/choose your sport|primary sport|select sport/i);
  }

  genderPromptBanner() {
    return this.page.getByText(/set your gender|set gender/i);
  }

  cityPromptBanner() {
    return this.page.getByText(/confirm your city|is this your city|city correct/i);
  }

  welcomePromptBanner() {
    return this.page.getByText(/welcome|questionnaire|tell us about/i);
  }

  sportQuestionnairePrompt() {
    return this.page.getByText(/level questionnaire|sport questionnaire|estimate your level/i);
  }

  async expectNameGateOpen() {
    await expect(this.nameSetModal()).toBeVisible({ timeout: 15_000 });
  }

  async saveName(firstName: string, lastName: string) {
    await this.nameFirstInput().fill(firstName);
    await this.nameLastInput().fill(lastName);
    await this.page.getByRole('button', { name: /^confirm$/i }).click();
    await expect(this.nameSetModal()).toHaveCount(0, { timeout: 15_000 });
  }

  async expectPrimarySportGate() {
    await expect(this.primarySportModal()).toBeVisible({ timeout: 20_000 });
  }

  async confirmPrimarySport() {
    await this.page.getByRole('button', { name: /^confirm$|^save$|^continue$/i }).click();
    await expect(this.primarySportModal()).toHaveCount(0, { timeout: 20_000 });
  }
}
