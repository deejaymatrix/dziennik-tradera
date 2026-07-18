import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('renderuje nazwę aplikacji po polsku', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Dziennik Tradera' })).toBeInTheDocument();
  });

  it('korzysta z packages/domain do sformatowania przykładowego salda', () => {
    render(<App />);
    expect(screen.getByTestId('przykladowe-saldo')).toHaveTextContent('0.00 EUR');
  });
});
