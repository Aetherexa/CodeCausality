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
  </style>
</head>
<body>
  <main class="app">
  <div class="toolbar">
    <button data-command="current">Current file</button>
    <button data-command="workingTree">Working tree</button>
  </div>
  <div class="status">${escapeHtml(status)}</div>
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
    });
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
      <div class="risk">${escapeHtml(impact.riskLevel)} ${impact.impactScore}/100</div>
      <div class="analysis-note">${escapeHtml(analysisNote)}</div>
      <div class="metrics">
        <div class="metric"><strong>${impact.foundTargets.length}</strong>${primaryMetricLabel}</div>
        <div class="metric"><strong>${impact.affectedFiles.length}</strong>affected</div>
        <div class="metric"><strong>${impact.affectedModules.length}</strong>modules</div>
        <div class="metric"><strong>${model.recommendedTests.length}</strong>tests</div>
      </div>
    </section>

    <h3>Impact graph</h3>
    ${renderImpactGraph(model.graph)}

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

function renderImpactGraph(graph: ImpactGraph): string {
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
        <option value="changed">Changed</option>
        <option value="affected">Affected</option>
        <option value="test">Tests</option>
      </select>
      <button type="button" data-graph-reset>Reset</button>
    </div>
    <div class="graph-legend">
      <span class="legend-item">Changed = solid focus border</span>
      <span class="legend-item">Test = dashed border</span>
      <span class="legend-item">Arrows = impact propagation</span>
    </div>
    <div class="graph-scroll">
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="CodeCausality impact graph">
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
