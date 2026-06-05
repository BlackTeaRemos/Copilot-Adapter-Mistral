// @ts-check

import * as js from '@eslint/js';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import stylistic from '@stylistic/eslint-plugin';
import * as tseslint from '@typescript-eslint/eslint-plugin';
import * as reactPlugin from 'eslint-plugin-react';

/**
 * ESLint config separated by responsibility.
 */
export default [
    // Core JS rules (merge recommended rules)
    {
        files: [`src/**/*.js`, `src/**/*.mjs`],
        languageOptions: {
            parserOptions: {
                ecmaVersion: `latest`,
                sourceType: `module`,
            },
            globals: {
                console: `readonly`,
                process: `readonly`,
            },
        },
        rules: {
            ...(js.configs?.recommended?.rules ?? {}),
        },
    },

    // TypeScript strict & stylistic (merge shared rules)
    {
        files: [`src/**/*.ts`, `src/**/*.tsx`],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: true,
                // @ts-ignore
                tsconfigRootDir: import.meta.dirname,
                ecmaVersion: `latest`,
                sourceType: `module`,
            },
            globals: {
                window: `readonly`,
                document: `readonly`,
                __dirname: `readonly`,
                require: `readonly`,
                module: `readonly`,
                exports: `readonly`,
                global: `readonly`,
                SVGSVGElement: `readonly`,
                MAIN_WINDOW_VITE_DEV_SERVER_URL: `readonly`,
                MAIN_WINDOW_VITE_NAME: `readonly`,
                setImmediate: `readonly`,
                clearImmediate: `readonly`,
                setTimeout: `readonly`,
                clearTimeout: `readonly`,
                setInterval: `readonly`,
                JSX: `readonly`,
            },
        },
        rules: {
            ...(tseslint.configs?.strict?.rules ?? {}),
            ...(tseslint.configs?.stylistic?.rules ?? {}),
        },
    },

    // Stylistic conventions
    {
        plugins: { '@stylistic': stylistic },
        rules: {
            curly: [`error`, `all`],
            'arrow-body-style': [`error`, `always`],

            '@stylistic/brace-style': [`error`, `1tbs`, { allowSingleLine: false }],
            '@stylistic/prefer-arrow-callback': `off`,
            '@stylistic/indent': [`error`, 4, { MemberExpression: `off`, SwitchCase: 1 }],
            '@stylistic/quotes': [`error`, `backtick`, { avoidEscape: true }],
            '@stylistic/semi': [`error`, `always`],
            '@stylistic/comma-dangle': [`error`, `always-multiline`],
            '@stylistic/space-before-function-paren': [`error`, `never`],
            '@stylistic/object-curly-spacing': [`error`, `always`],
            '@stylistic/array-bracket-spacing': [`error`, `never`],
            '@stylistic/key-spacing': [`error`, { beforeColon: false, afterColon: true }],
            '@stylistic/no-trailing-spaces': `error`,
            '@stylistic/eol-last': `error`,
            '@stylistic/comma-spacing': [`error`, { before: false, after: true }],
            '@stylistic/space-infix-ops': `error`,
            '@stylistic/space-unary-ops': `error`,
            '@stylistic/keyword-spacing': `error`,
            '@stylistic/arrow-spacing': `error`,
            '@stylistic/block-spacing': `error`,
        },
    },

    // React JSX rules (merge recommended react config)
    {
        rules: {
            ...(reactPlugin.configs?.recommended?.rules ?? {}),
            'react/jsx-uses-react': `off`,
            'react/react-in-jsx-scope': `off`,
        },
    },

    // Import plugin rules
    {
        plugins: { import: importPlugin },
        rules: {
            'import/order': `off`,
            'import/no-unresolved': `off`,
            'import/no-unused-modules': `warn`,
        },
    },

    // General TypeScript overrides
    {
        rules: {
            '@typescript-eslint/explicit-function-return-type': `off`,
            'no-undef': `off`,
            'no-unused-vars': `off`,
        },
    },
];
