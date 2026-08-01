import type { Config } from 'tailwindcss';

/** Every colour resolves to a CSS custom property from src/design/tokens.css. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
          subtle: token('surface-subtle'),
          inset: token('surface-inset'),
          hover: token('surface-hover'),
          selected: token('surface-selected'),
        },
        line: {
          subtle: token('border-subtle'),
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        content: {
          DEFAULT: token('text'),
          secondary: token('text-secondary'),
          tertiary: token('text-tertiary'),
          inverse: token('text-inverse'),
        },
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          active: token('primary-active'),
          fg: token('primary-fg'),
          subtle: token('primary-subtle'),
          text: token('primary-text'),
          border: token('primary-border'),
        },
        success: {
          DEFAULT: token('success'),
          bg: token('success-bg'),
          border: token('success-border'),
        },
        warning: {
          DEFAULT: token('warning'),
          bg: token('warning-bg'),
          border: token('warning-border'),
        },
        danger: {
          DEFAULT: token('danger'),
          hover: token('danger-hover'),
          bg: token('danger-bg'),
          border: token('danger-border'),
        },
        info: {
          DEFAULT: token('info'),
          bg: token('info-bg'),
          border: token('info-border'),
        },
        ai: {
          DEFAULT: token('ai'),
          bg: token('ai-bg'),
          border: token('ai-border'),
        },
        neutral: {
          bg: token('neutral-bg'),
          border: token('neutral-border'),
        },
        data: {
          1: token('data-1'),
          2: token('data-2'),
          3: token('data-3'),
          4: token('data-4'),
          5: token('data-5'),
        },
        focus: token('focus'),
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      /* Phase 6 §4 type scale 12/14/16/20/24/32, extended with 11 (micro
       * labels) and 13 (dense grids) which the density of an ERP requires. */
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        dense: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.25rem', { lineHeight: '1.75rem' }],
        xl: ['1.5rem', { lineHeight: '2rem' }],
        '2xl': ['2rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      spacing: {
        'row-compact': 'var(--row-h-compact)',
        row: 'var(--row-h)',
        'row-relaxed': 'var(--row-h-relaxed)',
        topbar: 'var(--topbar-h)',
        subbar: 'var(--subbar-h)',
        nav: 'var(--nav-w)',
        'nav-collapsed': 'var(--nav-w-collapsed)',
      },
      boxShadow: {
        overlay: 'var(--shadow-overlay)',
        popover: 'var(--shadow-popover)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'indeterminate-bar': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'scale-in': 'scale-in 120ms ease-out',
        'slide-in-right': 'slide-in-right 140ms ease-out',
        'indeterminate-bar': 'indeterminate-bar 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
