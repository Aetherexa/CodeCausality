# Releasing CodeCausality

CodeCausality uses GitHub Actions for CI and tag-driven Visual Studio Marketplace releases.

## CI

`.github/workflows/ci.yml` runs on pull requests to `main`, pushes to supported development branches, and manual dispatch. It:

- installs Node.js 22 and pnpm 10.17.1;
- runs the repository `pnpm check` quality gate;
- runs SonarQube Cloud when `SONAR_TOKEN` is configured;
- packages the VS Code extension;
- uploads a versioned VSIX workflow artifact.

## One-time Marketplace trusted publishing setup

The release workflow uses Visual Studio Marketplace OIDC trusted publishing. No long-lived `VSCE_PAT` is stored in GitHub.

In the Visual Studio Marketplace publisher settings for `aetherexa`, configure a trusted publishing policy that authorizes:

- GitHub owner: `Aetherexa`
- Repository: `CodeCausality`
- Workflow: `.github/workflows/release.yml`

The workflow has `id-token: write` permission and publishes with `vsce publish --oidc`.

## Release process

1. Update `packages/vscode/package.json` to the release version.
2. Merge the change into `main` and ensure CI is green.
3. Create and push a matching tag. For version `1.0.6`:

   ```bash
   git checkout main
   git pull origin main
   git tag v1.0.6
   git push origin v1.0.6
   ```

4. `.github/workflows/release.yml` re-runs the quality gate, packages the VSIX, validates that the tag matches the manifest version, publishes to the Visual Studio Marketplace using OIDC, and creates a GitHub Release with the versioned VSIX attached.

## SonarQube Cloud

`sonar-project.properties` is already configured. Add a repository Actions secret named `SONAR_TOKEN` to enable the scan in CI. If the secret is not configured, CI continues without the Sonar step.

## Dependency lockfile

The repository currently does not contain `pnpm-lock.yaml`, so CI intentionally installs with `--no-frozen-lockfile`. Commit a generated lockfile in a follow-up change, then switch CI and release installs to `pnpm install --frozen-lockfile` for fully reproducible dependency resolution.
