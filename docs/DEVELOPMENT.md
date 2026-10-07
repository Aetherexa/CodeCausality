# Development Setup

CodeCausality supports the repository's existing npm workspace flow and a pnpm-compatible local workflow.

## Recommended Node version

Use Node.js 22 for local release work. The Marketplace packaging workflow also runs on Node.js 22.

## pnpm

From the repository root:

```powershell
pnpm install
pnpm check
pnpm package:vsix
```

`pnpm check` runs a pnpm-native quality path. It builds `@codecausality/core` first so TypeScript consumers can resolve its generated declarations, then runs workspace typechecks/tests/builds.

`pnpm package:vsix` builds the core package first, bundles the VS Code extension with pnpm workspace links, and packages the production VSIX.

The repository includes `pnpm-workspace.yaml`, so pnpm recognizes every package under `packages/*` and links matching local workspace packages instead of treating the monorepo as a single package.

## npm

The CI-compatible npm commands remain supported:

```powershell
npm install
npm run quality
npm run package:vscode
```

## Do not mix package managers in one working tree

Avoid running Yarn, npm, and pnpm installs over the same existing `node_modules` tree. Their linking/layout strategies differ and can produce misleading filesystem errors.

If you already mixed them, clean once before reinstalling:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Get-ChildItem packages -Directory | ForEach-Object {
  Remove-Item -Recurse -Force "$($_.FullName)\node_modules" -ErrorAction SilentlyContinue
}
Remove-Item -Force yarn.lock -ErrorAction SilentlyContinue
pnpm install
```

After changing workspace structure or switching package managers, regenerate `pnpm-lock.yaml` once. A stale lock/node_modules tree can leave `@codecausality/core` unlinked even though the workspace file exists.

## Packaging output

A successful VSIX build creates:

```text
packages/vscode/codecausality-1.0.0.vsix
```

You can install it with:

```powershell
code --install-extension .\packages\vscode\codecausality-1.0.0.vsix
```
