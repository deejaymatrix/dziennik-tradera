import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoginPage } from './LoginPage.js';

const meta: Meta<typeof LoginPage> = {
  title: 'Ekrany/Logowanie',
  component: LoginPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Formularz i walidacja działają w pełni już teraz. Prawdziwe uwierzytelnianie ' +
          '(Supabase Auth) podłączymy w Kamieniu 2 - po poprawnym wypełnieniu formularz ' +
          'pokazuje jawną informację zamiast udawać zalogowanie.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof LoginPage>;

export const Domyślny: Story = {};
