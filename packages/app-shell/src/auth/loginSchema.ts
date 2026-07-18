import { z } from 'zod';
import { pl } from '@dziennik/i18n';

export const loginSchema = z.object({
  email: z.string().min(1, pl.auth.emailRequired).email(pl.auth.emailInvalid),
  password: z.string().min(1, pl.auth.passwordRequired).min(12, pl.auth.passwordTooShort),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
