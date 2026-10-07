import path from 'node:path';
import * as vscode from 'vscode';
import {
  analyzeChangeSetImpact,
  analyzeRepository,
  findArchitectureViolations,
  getGitChangedFiles,
  getGitFileHistory,
  loadCodeCausalityConfig,
  loadCodeOwners,
  recommendTests,
  resolveCodeOwners,
} from '@codecausality/core';
import type {
  ArchitectureViolation,
  ChangeSetImpactSummary,
  FileOwnership,
  GitFileHistory,
  RecommendedTest,
} from '@codecausality/core';

interface ExplorerModel {
  title: string;
  scope: string;
  impact: ChangeSetImpactSummary;
  recommendedTests: RecommendedTest[];
  architectureViolations: ArchitectureViolation[];
  ownership: FileOwnership[];
  history: GitFileHistory[];
}

class ImpactExplorerProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'codecausality.impactExplorer';

  private view?: vscode.WebviewView;
  private model?: ExplorerModel;
  private status = 'Open a source file or analyze the current working tree.';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    view.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const payload = message as { type?: string; path?: string };

      if (payload.type === 'openFile' && payload.path) {
        await this.openFile(payload.path);
      } else if (payload.type === 'analyzeCurrentFile') {
        await this.analyzeCurrentFile();
      } else if (payload.type === 'analyzeWorkingTree') {
        await this.analyzeWorkingTree();
      }
    });

    this.render();
  }

  async analyzeCurrentFile(): Promise<void> {
    const workspace = this.workspaceRoot();
    const editor = vscode.window.activeTextEditor;

    if (!workspace || !editor) {
      this.setStatus('Open a source file inside a workspace before running current-file analysis.');
      return;
    }

    const relative = normalizePath(path.relative(workspace, editor.document.uri.fsPath));
    if (relative.startsWith('..')) {
      this.setStatus('The active file is outside the current workspace.');
      return;
    }

    await this.runAnalysis([relative], `Current file: ${relative}`);
  }

  async analyzeWorkingTree(): Promise<void> {
    const workspace = this.workspaceRoot();
    if (!workspace) {
      this.setStatus('Open a Git workspace before running working-tree analysis.');
      return;
    }

    await this.withProgress('Analyzing working tree', async () => {
      const config = await loadCodeCausalityConfig(workspace);
      const snapshot = await analyzeRepository({
        rootDir: workspace,
        ignorePatterns: config.ignore,
      });
      const changeSet = await getGitChangedFiles({ rootDir: workspace });
      const sourceFiles = new Set(snapshot.files.map((file) => file.path));
      const targets = changeSet.files.filter((file) => sourceFiles.has(file));

      this.model = await this.buildModel(
        workspace,
        snapshot,
        targets,
        'Working tree',
        config.moduleDepth,
        config.architecture.boundaries,
      );
      this.status =
        targets.length === 0
          ? 'No changed source files found in the working tree.'
          : `Analyzed ${targets.length} changed source file(s).`;
      this.render();
    });
  }

  private async runAnalysis(targets: string[], label: string): Promise<void> {
    const workspace = this.workspaceRoot();
    if (!workspace) return;

    await this.withProgress('Analyzing change impact', async () => {
      const config = await loadCodeCausalityConfig(workspace);
      const snapshot = await analyzeRepository({
        rootDir: workspace,
        ignorePatterns: config.ignore,
      });

      this.model = await this.buildModel(
        workspace,
        snapshot,
        targets,
        label,
        config.moduleDepth,
        config.architecture.boundaries,
      );
      this.status = `Analysis complete for ${targets.length} source file(s).`;
      this.render();
    });
  }

  private async buildModel(
    workspace: string,
    snapshot: Awaited<ReturnType<typeof analyzeRepository>>,
    targets: string[],
    title: string,
    moduleDepth: number,
    boundaries: Parameters<typeof findArchitectureViolations>[1],
  ): Promise<ExplorerModel> {
    const impact = analyzeChangeSetImpact(snapshot, targets, { moduleDepth });
    const affected = new Set(impact.affectedFiles);
    const architectureViolations = findArchitectureViolations(
      snapshot.dependencies,
      boundaries,
    ).filter((violation) => affected.has(violation.from));

    const ownership = resolveCodeOwners(await loadCodeOwners(workspace), impact.foundTargets);
    const history = await getGitFileHistory(workspace, impact.foundTargets);

    return {
      title,
      scope: workspace,
      impact,
      recommendedTests: recommendTests(snapshot, impact),
      architectureViolations,
      ownership,
      history,
    };
  }

  private async openFile(relativePath: string): Promise<void> {
    const workspace = this.workspaceRoot();
    if (!workspace) return;

    const absolute = path.resolve(workspace, relativePath);
    const relative = path.relative(workspace, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return;

    try {
      const document = await vscode.workspace.openTextDocument(absolute);
      await vscode.window.showTextDocument(document, { preview: true });
    } catch {
      void vscode.window.showWarningMessage(`CodeCausality could not open ${relativePath}.`);
    }
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private async withProgress(label: string, operation: () => Promise<void>): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: `CodeCausality: ${label}`,
        },
        operation,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`Analysis failed: ${message}`);
      void vscode.window.showErrorMessage(`CodeCausality: ${message}`);
    }
  }

  private setStatus(status: string): void {
    this.status = status;
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    this.view.webview.html = renderHtml(this.model, this.status);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ImpactExplorerProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ImpactExplorerProvider.viewType, provider),
    vscode.commands.registerCommand('codecausality.analyzeCurrentFile', () =>
      provider.analyzeCurrentFile(),
    ),
    vscode.commands.registerCommand('codecausality.analyzeWorkingTree', () =>
      provider.analyzeWorkingTree(),
    ),
  );
}

export function deactivate(): void {}

function renderHtml(model: ExplorerModel | undefined, status: string): string {
  const nonce = createNonce();
  const body = model ? renderModel(model) : '<div class="empty">No analysis yet.</div>';

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
    button {
      border: 0;
      padding: 6px 10px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .status {
      margin-bottom: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
    }
    .hero {
      border: 1px solid var(--vscode-panel-border);
      padding: 12px;
      margin-bottom: 12px;
    }
    .hero h2 { margin: 0 0 4px; font-size: 15px; }
    .risk { font-size: 24px; font-weight: 700; margin: 8px 0; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .metric {
      border: 1px solid var(--vscode-panel-border);
      padding: 8px;
    }
    .metric strong { display: block; font-size: 16px; }
    h3 { margin: 16px 0 6px; font-size: 13px; text-transform: uppercase; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { border-bottom: 1px solid var(--vscode-panel-border); padding: 6px 0; }
    .file {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      word-break: break-word;
    }
    .meta { color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 2px; }
    .error { color: var(--vscode-errorForeground); }
    .warning { color: var(--vscode-editorWarning-foreground); }
    .empty { color: var(--vscode-descriptionForeground); padding: 16px 0; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button data-command="current">Current file</button>
    <button data-command="workingTree">Working tree</button>
  </div>
  <div class="status">${escapeHtml(status)}</div>
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelector('[data-command="current"]')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'analyzeCurrentFile' });
    });
    document.querySelector('[data-command="workingTree"]')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'analyzeWorkingTree' });
    });
    document.querySelectorAll('[data-file]').forEach((element) => {
      element.addEventListener('click', () => {
        vscode.postMessage({ type: 'openFile', path: element.getAttribute('data-file') });
      });
    });
  </script>
</body>
</html>`;
}

function renderModel(model: ExplorerModel): string {
  const { impact } = model;
  const impactedFiles = impact.affectedFiles.slice(0, 30);
  const ownerMap = new Map(model.ownership.map((item) => [item.file, item.owners]));

  return `
    <section class="hero">
      <h2>${escapeHtml(model.title)}</h2>
      <div class="risk">${escapeHtml(impact.riskLevel)} ${impact.impactScore}/100</div>
      <div class="metrics">
        <div class="metric"><strong>${impact.foundTargets.length}</strong>changed</div>
        <div class="metric"><strong>${impact.affectedFiles.length}</strong>affected</div>
        <div class="metric"><strong>${impact.affectedModules.length}</strong>modules</div>
        <div class="metric"><strong>${model.recommendedTests.length}</strong>tests</div>
      </div>
    </section>

    <h3>Affected files</h3>
    <ul>
      ${impactedFiles
        .map((file) => {
          const owners = ownerMap.get(file) ?? [];
          return `<li>
            ${fileLink(file)}
            ${owners.length ? `<div class="meta">Owners: ${escapeHtml(owners.join(', '))}</div>` : ''}
          </li>`;
        })
        .join('')}
    </ul>

    <h3>Recommended tests</h3>
    <ul>
      ${model.recommendedTests.length
        ? model.recommendedTests
            .map(
              (test) => `<li>
                ${fileLink(test.path)}
                <div class="meta">${escapeHtml(test.confidence.toUpperCase())} · ${escapeHtml(test.reasons.join(', '))}</div>
              </li>`,
            )
            .join('')
        : '<li class="meta">No deterministic test recommendations.</li>'}
    </ul>

    <h3>Architecture guardrails</h3>
    <ul>
      ${model.architectureViolations.length
        ? model.architectureViolations
            .map(
              (violation) => `<li>
                <div class="${violation.severity === 'error' ? 'error' : 'warning'}">
                  ${escapeHtml(violation.severity.toUpperCase())} · ${escapeHtml(violation.ruleName)}
                </div>
                <div>${fileLink(violation.from)} → ${fileLink(violation.to)}</div>
              </li>`,
            )
            .join('')
        : '<li class="meta">No relevant architecture violations.</li>'}
    </ul>

    <h3>Changed-file history</h3>
    <ul>
      ${model.history.length
        ? model.history
            .slice()
            .sort((a, b) => b.churn - a.churn)
            .slice(0, 10)
            .map(
              (item) => `<li>
                ${fileLink(item.file)}
                <div class="meta">${item.commitCount} commit(s) · churn ${item.churn} · ${escapeHtml(item.lastAuthor ?? 'unknown')}</div>
              </li>`,
            )
            .join('')
        : '<li class="meta">No tracked history evidence.</li>'}
    </ul>
  `;
}

function fileLink(file: string): string {
  const safe = escapeHtml(file);
  return `<span class="file" role="link" tabindex="0" data-file="${safe}">${safe}</span>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function createNonce(): string {
  return Array.from({ length: 24 }, () => Math.random().toString(36).slice(2, 3)).join('');
}
