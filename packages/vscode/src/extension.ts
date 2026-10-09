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

interface ImpactGraphNode {
  path: string;
  depth: number;
  row: number;
  kind: 'changed' | 'affected' | 'test';
}

interface ImpactGraphEdge {
  from: string;
  to: string;
}

interface ImpactGraph {
  nodes: ImpactGraphNode[];
  edges: ImpactGraphEdge[];
  truncated: boolean;
}

interface ExplorerModel {
  title: string;
  scope: string;
  impact: ChangeSetImpactSummary;
  graph: ImpactGraph;
  recommendedTests: RecommendedTest[];
  architectureViolations: ArchitectureViolation[];
  ownership: FileOwnership[];
  history: GitFileHistory[];
}

class ImpactExplorerPanel {
  static readonly viewType = 'codecausality.impactPanel';

  private panel?: vscode.WebviewPanel;
  private lastTextEditor?: vscode.TextEditor;
  private model?: ExplorerModel;
  private status = 'Open a source file or analyze the current working tree.';

  constructor(private readonly context: vscode.ExtensionContext) {
    this.lastTextEditor = vscode.window.activeTextEditor;
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.lastTextEditor = editor;
      }),
    );
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) return this.panel;

    const panel = vscode.window.createWebviewPanel(
      ImpactExplorerPanel.viewType,
      'CodeCausality Impact',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri],
      },
    );

    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const payload = message as { type?: string; path?: string };

      if (payload.type === 'openFile' && payload.path) {
        await this.openFile(payload.path);
      } else if (payload.type === 'analyzeCurrentFile') {
        await this.analyzeCurrentFile();
        await this.revealResults();
      } else if (payload.type === 'analyzeWorkingTree') {
        await this.analyzeWorkingTree();
        await this.revealResults();
      } else if (payload.type === 'openGettingStarted') {
        await openGettingStarted();
      }
    });

    this.panel = panel;
    this.render();
    return panel;
  }

  async analyzeCurrentFile(): Promise<void> {
    const workspace = this.workspaceRoot();
    const editor = vscode.window.activeTextEditor ?? this.lastTextEditor;

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
      graph: buildImpactGraph(snapshot.dependencies, impact),
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

  async revealResults(): Promise<void> {
    const panel = this.ensurePanel();
    panel.reveal(vscode.ViewColumn.Active, false);
    this.render();
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
    if (!this.panel) return;
    this.panel.webview.html = renderHtml(this.model, this.status);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const impactPanel = new ImpactExplorerPanel(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('codecausality.analyzeCurrentFile', async () => {
      await impactPanel.analyzeCurrentFile();
      await impactPanel.revealResults();
    }),
    vscode.commands.registerCommand('codecausality.analyzeWorkingTree', async () => {
      await impactPanel.analyzeWorkingTree();
      await impactPanel.revealResults();
    }),
    vscode.commands.registerCommand('codecausality.openGettingStarted', () =>
      openGettingStarted(),
    ),
  );
}

export function deactivate(): void {}

async function openGettingStarted(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openWalkthrough',
    'aetherexa.codecausality#codecausality.gettingStarted',
    false,
  );
}

function renderHtml(model: ExplorerModel | undefined, status: string): string {
  const nonce = createNonce();
  const body = model ? renderModel(model) : renderWelcome();
  const currentMode = model?.title.startsWith('Current file:') ?? false;
  const workingMode = model?.title === 'Working tree';
  const statusTone = status.startsWith('Analysis failed') ? 'error' : status.includes('complete') || status.startsWith('Analyzed') ? 'success' : 'neutral';

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
      padding: 24px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .app { max-width: 1480px; margin: 0 auto; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
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
    .analysis-note {
      margin: 2px 0 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
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
    .welcome {
      border: 1px solid var(--vscode-panel-border);
      padding: 14px;
      margin-top: 4px;
      background: var(--vscode-editor-background);
    }
    .welcome h2 { margin: 0 0 6px; font-size: 16px; }
    .welcome p { margin: 6px 0; line-height: 1.45; }
    .welcome ol { padding-left: 20px; margin: 10px 0; }
    .welcome li { border: 0; padding: 3px 0; }
    .welcome-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .graph-scroll {
      overflow: auto;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }
    .graph-scroll svg { display: block; }
    .graph-edge {
      stroke: var(--vscode-descriptionForeground);
      stroke-width: 1.2;
      opacity: 0.55;
    }
    .graph-node rect {
      fill: var(--vscode-sideBar-background);
      stroke: var(--vscode-panel-border);
      stroke-width: 1;
    }
    .graph-node.changed rect { stroke: var(--vscode-focusBorder); stroke-width: 2; }
    .graph-node.test rect { stroke-dasharray: 4 3; }
    .graph-node text {
      fill: var(--vscode-foreground);
      font-size: 11px;
      pointer-events: none;
    }
    .graph-node { cursor: pointer; }
    .graph-node:hover rect { stroke: var(--vscode-textLink-foreground); stroke-width: 2; }
    .graph-legend { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0; }
    .legend-item { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .graph-controls {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) auto auto;
      gap: 6px;
      margin: 6px 0;
    }
    .graph-controls input,
    .graph-controls select {
      min-width: 0;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      padding: 5px 7px;
      font: inherit;
    }
    .graph-node.filtered,
    .graph-edge.filtered { display: none; }
    /* Modern V1 dashboard */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 12% -10%, color-mix(in srgb, var(--vscode-focusBorder) 10%, transparent), transparent 34%),
        radial-gradient(circle at 92% 4%, color-mix(in srgb, var(--vscode-textLink-foreground) 7%, transparent), transparent 28%);
      opacity: .8;
    }
    .app { position: relative; max-width: 1500px; }
    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 18px;
      padding: 4px 0 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-mark {
      width: 34px; height: 34px; flex: 0 0 auto; border-radius: 9px;
      display: grid; place-items: center;
      color: var(--vscode-button-foreground);
      background: linear-gradient(145deg, var(--vscode-button-background), var(--vscode-textLink-foreground));
      box-shadow: 0 8px 28px color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
      font-weight: 800; font-size: 13px; letter-spacing: -.5px;
    }
    .brand-copy { min-width: 0; }
    .brand-title { font-weight: 700; font-size: 15px; letter-spacing: -.2px; }
    .brand-subtitle { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .toolbar {
      margin: 0;
      padding: 3px;
      border-radius: 9px;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-panel-border);
    }
    .toolbar button {
      border-radius: 6px;
      padding: 7px 12px;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      font-weight: 600;
    }
    .toolbar button:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
    .toolbar button.active {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin: 0 0 14px;
      padding: 6px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--vscode-editorWidget-background);
      font-size: 11px;
    }
    .status::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
    .status.success::before { background: var(--vscode-testing-iconPassed, #3fb950); }
    .status.error::before { background: var(--vscode-testing-iconFailed, #f85149); }
    .hero {
      border-radius: 14px;
      padding: 20px;
      margin: 0 0 18px;
      background: linear-gradient(145deg,
        color-mix(in srgb, var(--vscode-editorWidget-background) 92%, var(--vscode-focusBorder)),
        var(--vscode-editorWidget-background));
      box-shadow: 0 12px 36px rgba(0,0,0,.12);
    }
    .hero h2 { font-size: 16px; line-height: 1.45; word-break: break-word; }
    .risk {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      margin: 12px 0 6px;
      padding: 7px 10px;
      border-radius: 9px;
      border: 1px solid var(--vscode-panel-border);
      background: color-mix(in srgb, var(--vscode-editor-background) 75%, transparent);
      letter-spacing: -.4px;
    }
    .risk-low { color: var(--vscode-testing-iconPassed, #3fb950); }
    .risk-medium { color: var(--vscode-editorWarning-foreground, #d29922); }
    .risk-high, .risk-critical { color: var(--vscode-errorForeground, #f85149); }
    .analysis-note { max-width: 900px; }
    .metrics { gap: 10px; margin-top: 16px; }
    .metric {
      min-height: 72px;
      border-radius: 10px;
      padding: 12px 14px;
      background: color-mix(in srgb, var(--vscode-editor-background) 74%, var(--vscode-editorWidget-background));
      transition: transform .15s ease, border-color .15s ease;
    }
    .metric:hover { transform: translateY(-1px); border-color: var(--vscode-focusBorder); }
    .metric strong { font-size: 22px; line-height: 1.1; margin-bottom: 8px; letter-spacing: -.6px; }
    h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 24px 0 10px;
      font-size: 14px;
      letter-spacing: .1px;
      text-transform: none;
    }
    h3::before {
      content: '';
      width: 3px;
      height: 14px;
      border-radius: 3px;
      background: var(--vscode-focusBorder);
    }
    ul {
      display: grid;
      gap: 7px;
    }
    li {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 9px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 65%, transparent);
    }
    .file { font-weight: 550; text-decoration: none; }
    .file:hover { text-decoration: underline; }
    .meta { font-size: 11px; line-height: 1.4; }
    .graph-controls {
      grid-template-columns: minmax(220px, 1fr) auto auto auto auto auto;
      align-items: center;
      margin: 8px 0;
    }
    .graph-controls input, .graph-controls select {
      height: 34px;
      border-radius: 7px;
      padding: 6px 9px;
      outline: none;
    }
    .graph-controls input:focus, .graph-controls select:focus {
      border-color: var(--vscode-focusBorder);
    }
    .graph-controls button { height: 34px; border-radius: 7px; min-width: 34px; }
    .graph-legend { margin: 10px 0; gap: 8px; }
    .legend-item {
      padding: 4px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--vscode-editorWidget-background);
    }
    .graph-scroll {
      min-height: 360px;
      max-height: 640px;
      border-radius: 12px;
      background:
        linear-gradient(color-mix(in srgb, var(--vscode-editor-background) 96%, white), color-mix(in srgb, var(--vscode-editor-background) 96%, black)),
        repeating-linear-gradient(0deg, transparent, transparent 23px, color-mix(in srgb, var(--vscode-panel-border) 32%, transparent) 24px),
        repeating-linear-gradient(90deg, transparent, transparent 23px, color-mix(in srgb, var(--vscode-panel-border) 32%, transparent) 24px);
      cursor: grab;
    }
    .graph-scroll.is-panning { cursor: grabbing; user-select: none; }
    .graph-node rect { rx: 8; }
    .graph-node.changed rect {
      fill: color-mix(in srgb, var(--vscode-focusBorder) 9%, var(--vscode-editorWidget-background));
    }
    .graph-node.test rect {
      fill: color-mix(in srgb, var(--vscode-testing-iconPassed, #3fb950) 6%, var(--vscode-editorWidget-background));
    }
    .welcome {
      max-width: 720px;
      margin: 42px auto 0;
      padding: 26px;
      border-radius: 14px;
      background: var(--vscode-editorWidget-background);
      box-shadow: 0 12px 36px rgba(0,0,0,.12);
    }
    .welcome h2 { font-size: 22px; letter-spacing: -.5px; }
    .evidence-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 18px;
    }
    .panel-card {
      min-width: 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      padding: 14px;
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 74%, transparent);
    }
    .panel-card h3 { margin: 0; }
    .panel-card h3::before { display: none; }
    .section-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .section-heading p {
      margin: 4px 0 0;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.4;
    }
    .section-count {
      flex: 0 0 auto;
      min-width: 26px;
      padding: 3px 8px;
      border-radius: 999px;
      text-align: center;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      font-weight: 700;
    }
    .panel-card ul { gap: 6px; }
    .panel-card li { background: color-mix(in srgb, var(--vscode-editor-background) 75%, transparent); }
    .badge {
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .25px;
    }
    .badge-high { color: var(--vscode-testing-iconPassed, #3fb950); }
    .badge-error { color: var(--vscode-errorForeground, #f85149); }
    .badge-warning { color: var(--vscode-editorWarning-foreground, #d29922); }
    @media (max-width: 900px) {
      .evidence-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      body { padding: 16px; }
      .app-header { align-items: flex-start; flex-direction: column; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .graph-controls { grid-template-columns: 1fr 1fr 1fr; }
      .graph-controls input { grid-column: 1 / -1; }
    }
  </style>
</head>
<body>
  <main class="app">
    <header class="app-header">
      <div class="brand">
        <div class="brand-mark">CC</div>
        <div class="brand-copy">
          <div class="brand-title">CodeCausality</div>
          <div class="brand-subtitle">Change Impact Intelligence · local-first</div>
        </div>
      </div>
      <div class="toolbar" role="group" aria-label="Analysis mode">
        <button class="${currentMode ? 'active' : ''}" aria-pressed="${currentMode}" data-command="current">Current file</button>
        <button class="${workingMode ? 'active' : ''}" aria-pressed="${workingMode}" data-command="workingTree">Working tree</button>
      </div>
    </header>
    <div class="status ${statusTone}">${escapeHtml(status)}</div>
    ${body}
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelector('[data-command="current"]')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'analyzeCurrentFile' });
    });
    document.querySelector('[data-command="workingTree"]')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'analyzeWorkingTree' });
    });
    document.querySelector('[data-command="gettingStarted"]')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openGettingStarted' });
    });
    document.querySelectorAll('[data-file]').forEach((element) => {
      element.addEventListener('click', () => {
        vscode.postMessage({ type: 'openFile', path: element.getAttribute('data-file') });
      });
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          vscode.postMessage({ type: 'openFile', path: element.getAttribute('data-file') });
        }
      });
    });

    const graphSearch = document.querySelector('[data-graph-search]');
    const graphKind = document.querySelector('[data-graph-kind]');
    const graphReset = document.querySelector('[data-graph-reset]');
    const graphZoomIn = document.querySelector('[data-graph-zoom-in]');
    const graphZoomOut = document.querySelector('[data-graph-zoom-out]');
    const graphFit = document.querySelector('[data-graph-fit]');
    const graphViewport = document.querySelector('[data-graph-viewport]');
    const graphSvg = document.querySelector('[data-graph-svg]');
    let graphScale = 1;

    const setGraphScale = (nextScale) => {
      if (!graphSvg) return;
      graphScale = Math.min(1.75, Math.max(0.5, nextScale));
      const baseWidth = Number(graphSvg.getAttribute('data-base-width') ?? graphSvg.getAttribute('width') ?? 0);
      const baseHeight = Number(graphSvg.getAttribute('data-base-height') ?? graphSvg.getAttribute('height') ?? 0);
      if (!baseWidth || !baseHeight) return;
      graphSvg.setAttribute('width', String(Math.round(baseWidth * graphScale)));
      graphSvg.setAttribute('height', String(Math.round(baseHeight * graphScale)));
    };

    const applyGraphFilters = () => {
      const query = (graphSearch?.value ?? '').trim().toLowerCase();
      const kind = graphKind?.value ?? 'all';
      const visible = new Set();

      document.querySelectorAll('.graph-node[data-path]').forEach((node) => {
        const nodePath = node.getAttribute('data-path') ?? '';
        const nodeKind = node.getAttribute('data-kind') ?? '';
        const matchesQuery = !query || nodePath.toLowerCase().includes(query);
        const matchesKind = kind === 'all' || nodeKind === kind;
        const show = matchesQuery && matchesKind;
        node.classList.toggle('filtered', !show);
        if (show) visible.add(nodePath);
      });

      document.querySelectorAll('.graph-edge[data-from][data-to]').forEach((edge) => {
        const from = edge.getAttribute('data-from') ?? '';
        const to = edge.getAttribute('data-to') ?? '';
        edge.classList.toggle('filtered', !visible.has(from) || !visible.has(to));
      });
    };

    graphSearch?.addEventListener('input', applyGraphFilters);
    graphKind?.addEventListener('change', applyGraphFilters);
    graphReset?.addEventListener('click', () => {
      if (graphSearch) graphSearch.value = '';
      if (graphKind) graphKind.value = 'all';
      applyGraphFilters();
      setGraphScale(1);
      if (graphViewport) {
        graphViewport.scrollLeft = 0;
        graphViewport.scrollTop = 0;
      }
    });
    graphZoomIn?.addEventListener('click', () => setGraphScale(graphScale + 0.15));
    graphZoomOut?.addEventListener('click', () => setGraphScale(graphScale - 0.15));
    graphFit?.addEventListener('click', () => {
      if (!graphSvg || !graphViewport) return;
      const baseWidth = Number(graphSvg.getAttribute('data-base-width') ?? 0);
      if (!baseWidth) return;
      const available = Math.max(320, graphViewport.clientWidth - 24);
      setGraphScale(Math.min(1, available / baseWidth));
      graphViewport.scrollLeft = 0;
      graphViewport.scrollTop = 0;
    });

    if (graphViewport) {
      let panning = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      graphViewport.addEventListener('mousedown', (event) => {
        if (event.target.closest?.('.graph-node')) return;
        panning = true;
        startX = event.clientX;
        startY = event.clientY;
        startLeft = graphViewport.scrollLeft;
        startTop = graphViewport.scrollTop;
        graphViewport.classList.add('is-panning');
      });
      window.addEventListener('mousemove', (event) => {
        if (!panning) return;
        graphViewport.scrollLeft = startLeft - (event.clientX - startX);
        graphViewport.scrollTop = startTop - (event.clientY - startY);
      });
      window.addEventListener('mouseup', () => {
        panning = false;
        graphViewport.classList.remove('is-panning');
      });
    }
  </script>
</body>
</html>`;
}

function renderModel(model: ExplorerModel): string {
  const { impact } = model;
  const impactedFiles = impact.affectedFiles.slice(0, 30);
  const ownerMap = new Map(model.ownership.map((item) => [item.file, item.owners]));
  const isCurrentFile = model.title.startsWith('Current file:');
  const primaryMetricLabel = isCurrentFile ? 'target' : 'changed';
  const analysisNote = isCurrentFile
    ? 'Hypothetical impact analysis — this file is treated as the change target; it does not need to be modified on disk.'
    : 'Working-tree analysis — changed source files are read from your current Git working tree.';

  return `
    <section class="hero">
      <h2>${escapeHtml(model.title)}</h2>
      <div class="risk risk-${escapeHtml(impact.riskLevel.toLowerCase())}">${escapeHtml(impact.riskLevel)} <span>${impact.impactScore}/100</span></div>
      <div class="analysis-note">${escapeHtml(analysisNote)}</div>
      <div class="metrics">
        <div class="metric"><strong>${impact.foundTargets.length}</strong>${primaryMetricLabel}</div>
        <div class="metric"><strong>${impact.affectedFiles.length}</strong>affected</div>
        <div class="metric"><strong>${impact.affectedModules.length}</strong>modules</div>
        <div class="metric"><strong>${model.recommendedTests.length}</strong>tests</div>
      </div>
    </section>

    <h3>Impact graph</h3>
    ${renderImpactGraph(model.graph, isCurrentFile ? 'Target' : 'Changed')}

    <section class="evidence-grid">
      <article class="panel-card">
        <div class="section-heading">
          <div>
            <h3>Affected files</h3>
            <p>Downstream files inside the current blast radius.</p>
          </div>
          <span class="section-count">${impactedFiles.length}</span>
        </div>
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
      </article>

      <article class="panel-card">
        <div class="section-heading">
          <div>
            <h3>Recommended tests</h3>
            <p>Deterministic test evidence to validate first.</p>
          </div>
          <span class="section-count">${model.recommendedTests.length}</span>
        </div>
        <ul>
      ${model.recommendedTests.length
        ? model.recommendedTests
            .map(
              (test) => `<li>
                ${fileLink(test.path)}
                <div class="meta"><span class="badge badge-high">${escapeHtml(test.confidence.toUpperCase())}</span>${escapeHtml(test.reasons.join(', '))}</div>
              </li>`,
            )
            .join('')
        : '<li class="meta">No deterministic test recommendations.</li>'}
        </ul>
      </article>
    </section>

    <section class="evidence-grid">
      <article class="panel-card">
        <div class="section-heading">
          <div>
            <h3>Architecture guardrails</h3>
            <p>Relevant boundary rules reached by this impact surface.</p>
          </div>
          <span class="section-count">${model.architectureViolations.length}</span>
        </div>
        <ul>
      ${model.architectureViolations.length
        ? model.architectureViolations
            .map(
              (violation) => `<li>
                <div class="${violation.severity === 'error' ? 'error' : 'warning'}">
                  <span class="badge ${violation.severity === 'error' ? 'badge-error' : 'badge-warning'}">${escapeHtml(violation.severity.toUpperCase())}</span>${escapeHtml(violation.ruleName)}
                </div>
                <div>${fileLink(violation.from)} → ${fileLink(violation.to)}</div>
              </li>`,
            )
            .join('')
        : '<li class="meta">No relevant architecture violations.</li>'}
        </ul>
      </article>

      <article class="panel-card">
        <div class="section-heading">
          <div>
            <h3>Change history</h3>
            <p>Churn and ownership signals for the analyzed targets.</p>
          </div>
          <span class="section-count">${model.history.length}</span>
        </div>
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
      </article>
    </section>
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


function buildImpactGraph(
  dependencies: Array<{ from: string; to: string }>,
  impact: ChangeSetImpactSummary,
  maxNodes = 40,
): ImpactGraph {
  const affected = new Set(impact.affectedFiles);
  const tests = new Set(impact.affectedTests);
  const changed = new Set(impact.foundTargets);
  const reverse = new Map<string, string[]>();

  for (const edge of dependencies) {
    if (!affected.has(edge.from) || !affected.has(edge.to)) continue;
    const dependents = reverse.get(edge.to) ?? [];
    dependents.push(edge.from);
    reverse.set(edge.to, dependents);
  }

  const depth = new Map<string, number>();
  const queue = [...impact.foundTargets];
  for (const target of queue) depth.set(target, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const nextDepth = (depth.get(current) ?? 0) + 1;

    for (const dependent of reverse.get(current) ?? []) {
      const existing = depth.get(dependent);
      if (existing === undefined || nextDepth < existing) {
        depth.set(dependent, nextDepth);
        queue.push(dependent);
      }
    }
  }

  const ordered = [...affected].sort((a, b) => {
    const da = depth.get(a) ?? Number.MAX_SAFE_INTEGER;
    const db = depth.get(b) ?? Number.MAX_SAFE_INTEGER;
    return da - db || a.localeCompare(b);
  });
  const selected = ordered.slice(0, maxNodes);
  const selectedSet = new Set(selected);
  const fallbackDepth = Math.max(0, ...[...depth.values()]) + 1;
  const rowsByDepth = new Map<number, number>();

  const nodes = selected.map((file): ImpactGraphNode => {
    const nodeDepth = depth.get(file) ?? fallbackDepth;
    const row = rowsByDepth.get(nodeDepth) ?? 0;
    rowsByDepth.set(nodeDepth, row + 1);

    return {
      path: file,
      depth: nodeDepth,
      row,
      kind: changed.has(file) ? 'changed' : tests.has(file) ? 'test' : 'affected',
    };
  });

  const edges: ImpactGraphEdge[] = dependencies
    .filter(
      (edge) =>
        selectedSet.has(edge.from) &&
        selectedSet.has(edge.to) &&
        affected.has(edge.from) &&
        affected.has(edge.to),
    )
    .map((edge) => ({
      from: edge.to,
      to: edge.from,
    }));

  return {
    nodes,
    edges,
    truncated: affected.size > maxNodes,
  };
}

function renderImpactGraph(graph: ImpactGraph, focusLabel = 'Changed'): string {
  if (graph.nodes.length === 0) {
    return '<div class="empty">No impact graph available for this analysis.</div>';
  }

  const nodeWidth = 180;
  const nodeHeight = 42;
  const columnGap = 70;
  const rowGap = 20;
  const margin = 16;
  const maxDepth = Math.max(...graph.nodes.map((node) => node.depth));
  const maxRows = Math.max(
    1,
    ...Array.from({ length: maxDepth + 1 }, (_, depth) =>
      graph.nodes.filter((node) => node.depth === depth).length,
    ),
  );
  const width = margin * 2 + (maxDepth + 1) * nodeWidth + maxDepth * columnGap;
  const height = margin * 2 + maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap;
  const positions = new Map<string, { x: number; y: number }>();

  for (const node of graph.nodes) {
    positions.set(node.path, {
      x: margin + node.depth * (nodeWidth + columnGap),
      y: margin + node.row * (nodeHeight + rowGap),
    });
  }

  const edgeSvg = graph.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return '';
      const x1 = from.x + nodeWidth;
      const y1 = from.y + nodeHeight / 2;
      const x2 = to.x;
      const y2 = to.y + nodeHeight / 2;
      const midX = x1 + (x2 - x1) / 2;
      return `<path class="graph-edge" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" marker-end="url(#arrow)" />`;
    })
    .join('');

  const nodeSvg = graph.nodes
    .map((node) => {
      const position = positions.get(node.path);
      if (!position) return '';
      const label = shortenPath(node.path, 27);
      return `<g class="graph-node ${node.kind}" data-file="${escapeHtml(node.path)}" data-path="${escapeHtml(node.path)}" data-kind="${node.kind}" tabindex="0" transform="translate(${position.x}, ${position.y})">
        <rect width="${nodeWidth}" height="${nodeHeight}" rx="4" />
        <text x="10" y="18">${escapeHtml(label)}</text>
        <text x="10" y="33" class="meta">${escapeHtml(node.kind)}</text>
      </g>`;
    })
    .join('');

  return `<div class="graph-controls">
      <input type="search" data-graph-search placeholder="Filter graph by path" aria-label="Filter graph by path" />
      <select data-graph-kind aria-label="Filter graph by node type">
        <option value="all">All nodes</option>
        <option value="changed">${escapeHtml(focusLabel)}</option>
        <option value="affected">Affected</option>
        <option value="test">Tests</option>
      </select>
      <button type="button" data-graph-zoom-out title="Zoom out" aria-label="Zoom out">−</button>
      <button type="button" data-graph-zoom-in title="Zoom in" aria-label="Zoom in">+</button>
      <button type="button" data-graph-fit title="Fit graph to width">Fit</button>
      <button type="button" data-graph-reset>Reset</button>
    </div>
    <div class="graph-legend">
      <span class="legend-item">${escapeHtml(focusLabel)} = focus border</span>
      <span class="legend-item">Test = dashed border</span>
      <span class="legend-item">Arrows = impact propagation</span>
    </div>
    <div class="graph-scroll" data-graph-viewport>
      <svg data-graph-svg data-base-width="${width}" data-base-height="${height}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="CodeCausality impact graph">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--vscode-descriptionForeground)" />
          </marker>
        </defs>
        ${edgeSvg}
        ${nodeSvg}
      </svg>
    </div>
    ${graph.truncated ? '<div class="meta">Graph limited to the first 40 impacted files. List evidence remains complete.</div>' : ''}`;
}

function shortenPath(file: string, maxLength: number): string {
  if (file.length <= maxLength) return file;
  return '…' + file.slice(-(maxLength - 1));
}


function renderWelcome(): string {
  return `
    <section class="welcome">
      <h2>Understand the impact before you change the code.</h2>
      <p>
        CodeCausality maps source relationships locally and shows the likely blast radius
        of a file or your current Git changes.
      </p>
      <ol>
        <li>Open a JavaScript or TypeScript repository.</li>
        <li>Choose <strong>Current file</strong> or <strong>Working tree</strong>.</li>
        <li>Review affected files, tests, modules, architecture rules, and history evidence.</li>
      </ol>
      <p class="meta">Local-first. No account, API key, cloud upload, or telemetry required.</p>
      <div class="welcome-actions">
        <button data-command="gettingStarted">Getting started</button>
      </div>
    </section>
  `;
}
