# Development Setup

CodeCausality now uses the same monorepo build pattern as StackGenome.

## Toolchain

- pnpm 10.17.1
- Node.js 22+ for repository development
- TypeScript project references
- local workspace dependencies declared with `workspace:*`

## Install

```powershell
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install
```

## Validate

```powershell
pnpm check
```

The root TypeScript build graph resolves internal packages through project references and path aliases. CLI, MCP, and the VS Code extension all reference `@codecausality/core` as a workspace package.

## Package the VS Code extension

```powershell
pnpm package:vsix
```

Output:

```text
artifacts/codecausality-1.0.2.vsix
```

Install locally:

```powershell
code --install-extension .\artifacts\codecausality-1.0.2.vsix
```

## Why this layout

This mirrors StackGenome's proven build strategy:

- `pnpm-workspace.yaml` defines the monorepo.
- internal package dependencies use `workspace:*`.
- `tsconfig.json` at the root defines project references.
- `tsconfig.base.json` provides source path aliases.
- packages use `composite: true`.
- package builds use `tsc -b`.
- the VS Code extension is bundled with esbuild through `build.mjs`.
- `@vscode/vsce` is installed locally instead of being downloaded at packaging time.
- CI runs the same pnpm commands developers run locally.

Do not mix npm, Yarn, and pnpm installs in the same working tree.
