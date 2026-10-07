# Development Setup

CodeCausality supports npm workspaces and pnpm for local development and V1 release packaging.

## Node.js compatibility

CodeCausality development and packaging support **all currently supported Node.js release lines**:

- Node.js 22
- Node.js 24
- Node.js 26

The repository declares `node >=22` and the Windows pnpm smoke workflow executes the complete install, quality, and VSIX packaging flow on all three versions.

Node.js 20 and older are not official targets because they are end-of-life. The VS Code extension itself does **not** require the end user to install Node.js; VS Code provides the extension runtime. The Node requirement applies to repository development, CLI/MCP execution, and local VSIX packaging.

## pnpm

From the repository root:

```powershell
pnpm install
pnpm check
pnpm package:vsix
```

`pnpm check` runs a pnpm-native quality path. It builds `@codecausality/core` first so TypeScript consumers can resolve its generated declarations, then runs workspace typechecks/tests/builds.

`pnpm package:vsix` builds the core package first, bundles the VS Code extension with pnpm workspace links, and packages the production VSIX.

The repository includes `pnpm-workspace.yaml`, so pnpm recognizes every package under `packages/*` and links matching local workspace packages.

## npm

The existing npm workspace flow remains supported:

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
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
Remove-Item -Force pnpm-lock.yaml -ErrorAction SilentlyContinue

pnpm store prune
pnpm install
```

After changing workspace structure or switching package managers, regenerate `pnpm-lock.yaml` once. A stale lock/node_modules tree can leave `@codecausality/core` unlinked even though the workspace file exists.

## Verify workspace links

Before debugging TypeScript errors, confirm pnpm linked the internal package:

```powershell
Get-ChildItem .\packages\cli\node_modules\@codecausality
Get-ChildItem .\packages\vscode\node_modules\@codecausality
```

Both should contain `core`.

## Packaging output

A successful VSIX build creates:

```text
packages/vscode/codecausality-1.0.0.vsix
```

Install it with:

```powershell
code --install-extension .\packages\vscode\codecausality-1.0.0.vsix
```
