import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {}
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        starpage: {
          'color-scheme': 'dark',
          '--color-primary': '#7aa2f7',
          '--color-primary-content': '#101827',
          '--color-secondary': '#8abeb7',
          '--color-secondary-content': '#0f1a1f',
          '--color-accent': '#b4a1ff',
          '--color-accent-content': '#170f2c',
          '--color-neutral': '#111827',
          '--color-neutral-content': '#c9d3e4',
          '--color-base-100': '#1d2635',
          '--color-base-200': '#182131',
          '--color-base-300': '#121a28',
          '--color-base-content': '#dbe4f3',
          '--color-info': '#69a9d6',
          '--color-info-content': '#0f1f2a',
          '--color-success': '#79c89f',
          '--color-success-content': '#0f2418',
          '--color-warning': '#d0af6d',
          '--color-warning-content': '#2b200f',
          '--color-error': '#d68383',
          '--color-error-content': '#2b1212'
        }
      },
      {
        'starpage-light': {
          'color-scheme': 'light',
          '--color-primary': '#3f6adf',
          '--color-primary-content': '#f8faff',
          '--color-secondary': '#2f8f87',
          '--color-secondary-content': '#f3fffd',
          '--color-accent': '#6f56d8',
          '--color-accent-content': '#fbf9ff',
          '--color-neutral': '#e8eef7',
          '--color-neutral-content': '#223148',
          '--color-base-100': '#ffffff',
          '--color-base-200': '#f3f7fd',
          '--color-base-300': '#e7eef8',
          '--color-base-content': '#1e2b3f',
          '--color-info': '#2e8fcc',
          '--color-info-content': '#f3faff',
          '--color-success': '#2f9966',
          '--color-success-content': '#f3fff9',
          '--color-warning': '#b07a1f',
          '--color-warning-content': '#fffaf0',
          '--color-error': '#c04444',
          '--color-error-content': '#fff5f5'
        }
      }
    ]
  }
};
