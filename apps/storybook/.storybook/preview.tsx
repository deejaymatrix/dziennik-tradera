import type { Preview } from '@storybook/react-vite';
import { ThemeProvider } from '@dziennik/ui';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true }, // motyw (tokens.css) steruje tłem, nie addon backgrounds
  },
  globalTypes: {
    theme: {
      description: 'Motyw Dziennika Tradera',
      toolbar: {
        title: 'Motyw',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Ciemny (domyślny)' },
          { value: 'light', title: 'Jasny' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals.theme as 'dark' | 'light') ?? 'dark';
      return (
        <ThemeProvider key={theme} defaultTheme={theme}>
          <div style={{ padding: '1.5rem', minHeight: '100vh' }}>
            <Story />
          </div>
        </ThemeProvider>
      );
    },
  ],
};

export default preview;
