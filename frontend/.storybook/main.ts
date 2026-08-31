import type { StorybookConfig } from '@storybook/nextjs'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/nextjs',
    options: {
      // Usa un next.config mínimo (sin next-intl ni output standalone) para no
      // romper el builder webpack5 de Storybook.
      nextConfigPath: '../.storybook/next.config.js',
    },
  },
  staticDirs: ['../public'],
  docs: {
    autodocs: 'tag',
  },
}

export default config
