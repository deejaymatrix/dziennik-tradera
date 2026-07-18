import { useState } from 'react';
import { Button, Card, Heading, SelectField, Text, TextField } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';
import {
  accountTypeOptions,
  reportingCurrencyOptions,
  timezoneOptions,
} from './onboardingOptions.js';
import styles from './OnboardingPage.module.css';

type Step = 1 | 2 | 3;
const TOTAL_STEPS = 3;

interface OnboardingData {
  displayName: string;
  timezone: string;
  reportingCurrency: string;
  accountName: string;
  accountType: string;
  strategyName: string;
}

const initialData: OnboardingData = {
  displayName: '',
  timezone: 'Europe/Amsterdam',
  reportingCurrency: 'EUR',
  accountName: '',
  accountType: 'live',
  strategyName: '',
};

export function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [stepError, setStepError] = useState<string | null>(null);
  const [finished, setFinished] = useState<'completed' | 'skippedStrategy' | null>(null);

  function update<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function goNext() {
    if (step === 1 && !data.displayName.trim()) {
      setStepError(pl.onboarding.displayNameRequired);
      return;
    }
    if (step === 2 && !data.accountName.trim()) {
      setStepError(pl.onboarding.accountNameRequired);
      return;
    }
    setStepError(null);
    setStep((current) => (current < TOTAL_STEPS ? ((current + 1) as Step) : current));
  }

  function goBack() {
    setStepError(null);
    setStep((current) => (current > 1 ? ((current - 1) as Step) : current));
  }

  if (finished) {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <Heading level={1}>{pl.onboarding.title}</Heading>
          <div className={styles.notice} role="status">
            <Text weight="medium">
              {finished === 'skippedStrategy'
                ? pl.onboarding.skipStrategyWarning
                : 'Konfiguracja gotowa do zapisania.'}
            </Text>
            <Text tone="secondary" size="sm">
              {pl.onboarding.backendNotConnectedDescription}
            </Text>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div>
          <Text size="sm" tone="tertiary" className={styles.stepLabel}>
            {pl.onboarding.stepLabel
              .replace('{current}', String(step))
              .replace('{total}', String(TOTAL_STEPS))}
          </Text>
          <Heading level={1}>{pl.onboarding.title}</Heading>
        </div>

        {step === 1 ? (
          <div className={styles.form}>
            <Heading level={2}>{pl.onboarding.profileStepTitle}</Heading>
            <Text tone="secondary" size="sm">
              {pl.onboarding.profileStepDescription}
            </Text>
            <TextField
              label={pl.onboarding.displayNameLabel}
              value={data.displayName}
              onChange={(event) => update('displayName', event.target.value)}
              required
              error={stepError ?? undefined}
            />
            <SelectField
              label={pl.onboarding.timezoneLabel}
              options={timezoneOptions}
              value={data.timezone}
              onChange={(event) => update('timezone', event.target.value)}
            />
            <SelectField
              label={pl.onboarding.reportingCurrencyLabel}
              options={reportingCurrencyOptions}
              value={data.reportingCurrency}
              onChange={(event) => update('reportingCurrency', event.target.value)}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className={styles.form}>
            <Heading level={2}>{pl.onboarding.accountStepTitle}</Heading>
            <Text tone="secondary" size="sm">
              {pl.onboarding.accountStepDescription}
            </Text>
            <TextField
              label={pl.onboarding.accountNameLabel}
              hint={pl.onboarding.accountNameHint}
              value={data.accountName}
              onChange={(event) => update('accountName', event.target.value)}
              required
              error={stepError ?? undefined}
            />
            <SelectField
              label={pl.onboarding.accountTypeLabel}
              options={accountTypeOptions}
              value={data.accountType}
              onChange={(event) => update('accountType', event.target.value)}
            />
            <SelectField
              label={pl.onboarding.accountCurrencyLabel}
              options={reportingCurrencyOptions}
              value={data.reportingCurrency}
              onChange={(event) => update('reportingCurrency', event.target.value)}
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className={styles.form}>
            <Heading level={2}>{pl.onboarding.strategyStepTitle}</Heading>
            <Text tone="secondary" size="sm">
              {pl.onboarding.strategyStepDescription}
            </Text>
            <TextField
              label={pl.onboarding.strategyNameLabel}
              value={data.strategyName}
              onChange={(event) => update('strategyName', event.target.value)}
              placeholder="np. Wybicie zakresu otwarcia"
            />
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button variant="ghost" onClick={goBack} disabled={step === 1}>
            {pl.onboarding.back}
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={goNext}>{pl.onboarding.next}</Button>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              <Button
                variant="secondary"
                onClick={() =>
                  setFinished(data.strategyName.trim() ? 'completed' : 'skippedStrategy')
                }
              >
                {data.strategyName.trim() ? pl.onboarding.finish : pl.onboarding.skipStrategy}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
