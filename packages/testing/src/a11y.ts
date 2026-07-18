import { axe, type JestAxeConfigureOptions } from 'jest-axe';
import { expect } from 'vitest';

/**
 * Uruchamia axe-core na zrenderowanym kontenerze i asertuje brak naruszeń.
 * Nie używamy matchera `toHaveNoViolations` z jest-axe przez expect.extend,
 * bo jego implementacja zakłada wewnętrzne API Jest i rzuca
 * `expectAssertion.call is not a function` pod Vitest.
 */
export async function expectNoAccessibilityViolations(
  container: Element,
  options?: JestAxeConfigureOptions,
): Promise<void> {
  const results = await axe(container, options);
  expect(results.violations, describeViolations(results.violations)).toEqual([]);
}

function describeViolations(violations: readonly { id: string; help: string }[]): string {
  if (violations.length === 0) {
    return '';
  }
  return violations.map((v) => `${v.id}: ${v.help}`).join('\n');
}
