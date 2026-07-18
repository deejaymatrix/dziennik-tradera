import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('renderuje Dashboard w spójnym shellu (packages/app-shell) na ścieżce domyślnej', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Otwórz paletę poleceń' })).toBeInTheDocument();
  });
});
