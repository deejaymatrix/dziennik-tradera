import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, Heading, Text, TextField } from '@dziennik/ui';
import { pl } from '@dziennik/i18n';
import { loginSchema, type LoginFormValues } from './loginSchema.js';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const [submitted, setSubmitted] = useState<LoginFormValues | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  function onSubmit(values: LoginFormValues) {
    // Uwierzytelnianie (Supabase Auth) podłączymy w Kamieniu 2. Na razie formularz
    // wyłącznie waliduje dane po stronie klienta i pokazuje jawną informację,
    // zamiast udawać zalogowanie - docs/specyfikacja-produktu.md §2.6.
    setSubmitted(values);
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <Heading level={1}>{pl.auth.loginTitle}</Heading>
          <Text tone="secondary">{pl.auth.loginSubtitle}</Text>
        </div>

        {submitted ? (
          <div className={styles.notice} role="status">
            <Text weight="medium">{pl.auth.backendNotConnectedTitle}</Text>
            <Text tone="secondary" size="sm">
              {pl.auth.backendNotConnectedDescription}
            </Text>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
            <TextField
              label={pl.auth.emailLabel}
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label={pl.auth.passwordLabel}
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {pl.auth.loginButton}
            </Button>
          </form>
        )}

        <Text as="div" size="sm" tone="tertiary" className={styles.footerNote}>
          {pl.auth.noPublicRegistration}
        </Text>
      </Card>
    </div>
  );
}
