import type { Meta, StoryObj } from '@storybook/react-vite';
import { OnboardingPage } from './OnboardingPage.js';

const meta: Meta<typeof OnboardingPage> = {
  title: 'Ekrany/Onboarding',
  component: OnboardingPage,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof OnboardingPage>;

export const KrokProfil: Story = {
  name: 'Krok 1 - profil',
};
