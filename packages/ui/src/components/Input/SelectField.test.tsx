import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectNoAccessibilityViolations } from '@dziennik/testing';
import { SelectField } from './SelectField.js';

const options = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
];

describe('SelectField', () => {
  it('wiąże etykietę z polem select', () => {
    render(<SelectField label="Waluta raportowa" options={options} />);
    expect(screen.getByLabelText('Waluta raportowa')).toBeInTheDocument();
  });

  it('renderuje wszystkie opcje', () => {
    render(<SelectField label="Waluta raportowa" options={options} />);
    expect(screen.getByRole('option', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'USD' })).toBeInTheDocument();
  });

  it('nie ma naruszeń dostępności', async () => {
    const { container } = render(<SelectField label="Typ konta" options={options} required />);
    await expectNoAccessibilityViolations(container);
  });
});
