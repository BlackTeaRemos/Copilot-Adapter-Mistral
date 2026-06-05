import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
    js.configs.recommended,
    {
        files: [`**/*.{js,jsx,ts,tsx}`],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: `latest`,
                sourceType: `module`,
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                window: `readonly`,
                document: `readonly`,
                console: `readonly`,
                process: `readonly`,
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
        plugins: {
            '@typescript-eslint': tseslint,
            import: importPlugin,
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
        },
        rules: {
            // K&R Style Rules
            'brace-style': [`error`, `1tbs`, { allowSingleLine: false }],
            curly: [`error`, `all`],
            'arrow-body-style': [`error`, `always`],
            'prefer-arrow-callback': `off`,
            indent: [`error`, 4, { MemberExpression: `off`, SwitchCase: 1 }],
            quotes: [`error`, `backtick`, { avoidEscape: true }],
            semi: [`error`, `always`],
            'comma-dangle': [`error`, `always-multiline`],
            'space-before-function-paren': [`error`, { anonymous: `never`, named: `never`, asyncArrow: `never` }],
            'object-curly-spacing': [`error`, `always`],
            'array-bracket-spacing': [`error`, `never`],
            'key-spacing': [`error`, { beforeColon: false, afterColon: true }],
            'no-trailing-spaces': `error`,
            'eol-last': `error`,
            'comma-spacing': [`error`, { before: false, after: true }],
            'space-infix-ops': `error`,
            'space-unary-ops': `error`,
            'keyword-spacing': `error`,
            'arrow-spacing': `error`,
            'block-spacing': `error`,

            // TypeScript Rules
            '@typescript-eslint/no-unused-vars': [`off`, { argsIgnorePattern: `^_` }],
            '@typescript-eslint/explicit-function-return-type': `off`,
            '@typescript-eslint/no-explicit-any': `warn`,

            // React Rules
            'react/jsx-uses-react': `off`,
            'react/react-in-jsx-scope': `off`,
            'react/jsx-uses-vars': `error`,
            'react-hooks/rules-of-hooks': `error`,
            'react-hooks/exhaustive-deps': `warn`,

            // Import Rules
            'import/order': `off`,
            'import/no-unresolved': `off`,
            'import/no-unused-modules': `warn`,
        },
        settings: {
            react: {
                version: `detect`,
            },
            'import/resolver': {
                typescript: {},
                node: {
                    extensions: [`.js`, `.jsx`, `.ts`, `.tsx`],
                },
            },
        },
    },
    {
        files: [`**/*.js`],
        rules: {
            '@typescript-eslint/no-var-requires': `off`,
        },
    },
];
