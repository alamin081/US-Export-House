import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * ESLint flat config.
 *
 * Besides the Next.js + TypeScript defaults, this file mechanically enforces
 * the layering rules from the architecture spec (section 2), so a boundary
 * violation fails `npm run lint` and CI instead of being caught in review:
 *
 *   Presentation (app/, components/)  ->  may import services, never repositories
 *   Business logic (*.service.ts)     ->  may import its own module repositories
 *   Data access (*.repository.ts)     ->  the only place Prisma is allowed
 */

/** Prisma may only be imported by repositories and the shared db client. */
const prismaRestrictions = [
  {
    name: "@prisma/client",
    message:
      "Prisma may only be imported in *.repository.ts files or src/lib/db.ts. Call a service instead.",
  },
  {
    name: "@/generated/prisma/client",
    message:
      "The generated Prisma client may only be imported in src/lib/db.ts. Call a service instead.",
  },
];

const repositoryRestriction = {
  group: ["**/*.repository", "**/*.repository.ts", "@/modules/*/*.repository*"],
  message:
    "Repositories are data access only. Import the module's *.service.ts instead (spec section 2, rule 2).",
};

const dbClientRestriction = {
  group: ["@/lib/db", "**/lib/db"],
  message: "The Prisma client is reserved for *.repository.ts files.",
};

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,

  {
    name: "use/ignores",
    ignores: [
      ".next/**",
      ".next-e2e/**",
      "e2e-results/**",
      "src/generated/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },

  {
    name: "use/base-rules",
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "Use a union type or a Prisma enum instead of a TypeScript enum.",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },

  {
    name: "use/layer-presentation",
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/modules/**/components/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: prismaRestrictions, patterns: [repositoryRestriction, dbClientRestriction] },
      ],
    },
  },

  {
    name: "use/layer-service",
    files: ["src/modules/**/*.service.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: prismaRestrictions }],
    },
  },

  {
    name: "use/layer-integrations",
    files: ["src/integrations/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: prismaRestrictions,
          patterns: [
            repositoryRestriction,
            dbClientRestriction,
            {
              group: ["@/modules/**"],
              message:
                "Integrations are driven by services, not the other way around. Keep them dependency-free.",
            },
          ],
        },
      ],
    },
  },

  {
    name: "use/config-and-tests",
    files: ["*.{js,mjs,cjs,ts}", "tests/**/*.ts", "prisma/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
