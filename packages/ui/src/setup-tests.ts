import '@testing-library/jest-dom/vitest';

// Uwaga: matcher `toHaveNoViolations` z jest-axe nie jest kompatybilny z Vitest
// (`expectAssertion.call is not a function`). Zamiast rejestrować go przez
// expect.extend, testy dostępności asertują bezpośrednio na `results.violations`
// - patrz packages/testing/src/a11y.ts (expectNoAccessibilityViolations).
