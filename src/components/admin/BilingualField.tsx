'use client';

import { useTranslations } from 'next-intl';

/**
 * A paired Arabic/English input (FR-057).
 *
 * The two languages sit side by side rather than behind a tab, because a tab
 * lets someone fill one and forget the other — and a product with no Arabic
 * name is invisible to the customers this shop actually has.
 *
 * `required` on both is the browser's contribution. The refusal that matters is
 * the NOT NULL pair in the schema; this only makes it impossible to reach.
 *
 * Each side carries its own `dir`: the Arabic box stays right-to-left while the
 * English box stays left-to-right, whichever language the console itself is in.
 */
export function BilingualField({
  name,
  label,
  defaultAr = '',
  defaultEn = '',
  required = true,
  multiline = false,
  error,
}: {
  /** Base field name — `name` produces `name_ar` and `name_en`. */
  name: string;
  label: string;
  defaultAr?: string;
  defaultEn?: string;
  required?: boolean;
  multiline?: boolean;
  error?: string;
}) {
  const t = useTranslations('admin');

  const control = [
    'w-full min-h-touch rounded border bg-surface px-3 py-2 text-base text-ink',
    'transition-colors focus:border-brand focus:outline-none',
    error ? 'border-danger' : 'border-rule',
  ].join(' ');

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="ms-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${name}_ar`} className="text-xs font-semibold text-ink-3">
            {t('arabic')}
          </label>
          {multiline ? (
            <textarea
              id={`${name}_ar`}
              name={`${name}_ar`}
              defaultValue={defaultAr}
              required={required}
              dir="rtl"
              lang="ar"
              rows={4}
              className={control}
            />
          ) : (
            <input
              id={`${name}_ar`}
              name={`${name}_ar`}
              defaultValue={defaultAr}
              required={required}
              dir="rtl"
              lang="ar"
              className={control}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${name}_en`} className="text-xs font-semibold text-ink-3">
            {t('english')}
          </label>
          {multiline ? (
            <textarea
              id={`${name}_en`}
              name={`${name}_en`}
              defaultValue={defaultEn}
              required={required}
              dir="ltr"
              lang="en"
              rows={4}
              className={control}
            />
          ) : (
            <input
              id={`${name}_en`}
              name={`${name}_en`}
              defaultValue={defaultEn}
              required={required}
              dir="ltr"
              lang="en"
              className={control}
            />
          )}
        </div>
      </div>

      {required && <p className="text-xs text-ink-3">{t('bothLanguagesRequired')}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
