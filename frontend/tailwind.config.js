/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* semantic page tokens */
        page: 'var(--color-bg-page)',
        card: 'var(--color-bg-card)',
        'card-alt': 'var(--color-bg-card-alt)',
        'input-bg': 'var(--color-bg-input)',
        'hover-bg': 'var(--color-bg-hover)',
        'skeleton': 'var(--color-bg-skeleton)',
        'skeleton-bright': 'var(--color-bg-skeleton-bright)',
        'btn-primary': 'var(--color-bg-btn-primary)',
        'btn-primary-hover': 'var(--color-bg-btn-primary-hover)',
        'btn-primary-text': 'var(--color-text-btn-primary)',
        'nav-active': 'var(--color-bg-nav-active)',
        'nav-active-text': 'var(--color-text-nav-active)',
        'nav-pill': 'var(--color-bg-nav-pill)',
        'nav-pill-text': 'var(--color-text-nav-pill)',
        heading: 'var(--color-text-heading)',
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
        faint: 'var(--color-text-faint)',
        link: 'var(--color-text-link)',
        'th-border': 'var(--color-border)',
        'th-border-light': 'var(--color-border-light)',
        'border-input': 'var(--color-border-input)',
        accent: 'var(--color-accent)',
        'accent-alt': 'var(--color-accent-alt)',
        'form-label': 'var(--color-form-label)',
        'th-overlay': 'var(--color-overlay)',
        'shopping-bg': 'var(--color-shopping-bg)',
        'shopping-text': 'var(--color-shopping-text)',
        'shopping-muted': 'var(--color-shopping-muted)',
        'shopping-card': 'var(--color-shopping-card)',
        /* keep parchment/surface as aliases for backward compat */
        parchment: 'var(--color-bg-page)',
        surface: 'var(--color-bg-card)',
      },
      borderRadius: {
        card: '10px',
      },
      fontFamily: {
        display: ['"Cabin"', 'system-ui', 'sans-serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px var(--color-shadow)',
      },
    },
  },
  plugins: [],
};
