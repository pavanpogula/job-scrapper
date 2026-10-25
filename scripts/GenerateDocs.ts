/**
 * @file Documentation Generator
 * @summary Parses TypeScript and Prisma files for JSDoc metadata and generates docs/project-explorer.html
 * @tags Documentation, Generator, HTML, JSDoc, Prisma
 */

import * as fs from 'fs';
import * as path from 'path';

interface FunctionDoc {
    name: string;
    summary: string;
    params?: string[];
}

interface FileDoc {
    name: string;
    path: string;
    icon: string;
    iconClass: string;
    summary: string;
    tags: string[];
    functions: FunctionDoc[];
}

// Icon mapping based on file location/name
function getFileIcon(filePath: string): { icon: string; iconClass: string } {
    const lower = filePath.toLowerCase();
    if (lower.includes('scraper')) return { icon: '⭐', iconClass: 'pink' };
    if (lower.includes('discovery') || lower.includes('cdx')) return { icon: '🔍', iconClass: 'yellow' };
    if (lower.includes('dbmenu')) return { icon: '💻', iconClass: 'cyan' };
    if (lower.includes('clean')) return { icon: '🧹', iconClass: 'blue' };
    if (lower.includes('inspect')) return { icon: '🔬', iconClass: 'purple' };
    if (lower.includes('redis')) return { icon: '⚡', iconClass: 'pink' };
    if (lower.includes('config') || lower.includes('companies')) return { icon: '📋', iconClass: 'green' };
    if (lower.includes('seed')) return { icon: '🌱', iconClass: 'green' };
    if (lower.includes('process')) return { icon: '🔧', iconClass: 'yellow' };
    if (lower.endsWith('.prisma')) return { icon: '🗄️', iconClass: 'purple' };
    if (lower.includes('lib')) return { icon: '📦', iconClass: 'blue' };
    if (lower.includes('scripts')) return { icon: '📜', iconClass: 'cyan' };
    if (lower.includes('csv')) return { icon: '📄', iconClass: 'green' };
    return { icon: '📝', iconClass: 'blue' };
}

// Directories to exclude from scanning
const EXCLUDED_DIRS = ['node_modules', 'dist', '.git', 'docs', 'output', '.vscode', 'apikeys', 'job-scrapper-ui', 'web', '.agents', '.claude'];

// Auto-discover all TypeScript and Prisma files
function discoverFiles(dir: string, baseDir: string = dir): { path: string; icon: string; iconClass: string }[] {
    const results: { path: string; icon: string; iconClass: string }[] = [];

    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
            // Skip excluded directories
            if (EXCLUDED_DIRS.includes(entry.name)) continue;
            // Recursively scan subdirectories
            results.push(...discoverFiles(fullPath, baseDir));
        } else if (entry.isFile()) {
            // Include .ts and .prisma files (exclude .d.ts files)
            if ((entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) ||
                entry.name.endsWith('.prisma')) {
                const iconInfo = getFileIcon(relativePath);
                results.push({
                    path: relativePath,
                    ...iconInfo
                });
            }
        }
    }

    return results;
}

function parseJSDoc(content: string): { fileSummary: string; fileTags: string[]; functions: FunctionDoc[] } {
    let fileSummary = '';
    let fileTags: string[] = [];
    const functions: FunctionDoc[] = [];

    // Extract file-level JSDoc (first block at top of file starting with @file)
    const fileDocMatch = content.match(/^\s*\/\*\*[\s\S]*?@file[\s\S]*?\*\//);
    if (fileDocMatch) {
        const block = fileDocMatch[0];

        // Extract @file description
        const fileMatch = block.match(/@file\s+(.+)/);
        if (fileMatch) fileSummary = fileMatch[1].trim();

        // Extract @summary if present (overrides @file)
        const summaryMatch = block.match(/@summary\s+(.+)/);
        if (summaryMatch) fileSummary = summaryMatch[1].trim();

        // Extract @tags
        const tagsMatch = block.match(/@tags\s+(.+)/);
        if (tagsMatch) {
            fileTags = tagsMatch[1].split(',').map(t => t.trim());
        }
    }

    // Extract function-level JSDoc
    // More robust pattern that handles various modifier orders:
    // - private async fetchJobs()
    // - public processCompany()
    // - async function runAll()
    // - export function isValidSlug()
    const allJSDocBlocks = content.matchAll(/\/\*\*\s*([\s\S]*?)\*\//g);

    for (const blockMatch of allJSDocBlocks) {
        const docBlock = blockMatch[1];
        const blockEndIndex = blockMatch.index! + blockMatch[0].length;

        // Skip file-level docs
        if (docBlock.includes('@file')) continue;

        // Look for function/method declaration after this JSDoc block
        // Get the next 200 chars after the block to find the function name
        const afterBlock = content.slice(blockEndIndex, blockEndIndex + 200);

        // Match various function patterns:
        // - private async funcName(
        // - public funcName(
        // - export function funcName(
        // - async function funcName(
        // - funcName(
        const funcMatch = afterBlock.match(
            /^\s*(?:export\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*\(/
        );

        if (!funcMatch) continue;

        const funcName = funcMatch[1];

        // Skip common non-function matches
        if (['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'await'].includes(funcName)) continue;

        // Extract summary
        let summary = '';
        const funcSummaryMatch = docBlock.match(/@summary\s+(.+)/);
        if (funcSummaryMatch) {
            summary = funcSummaryMatch[1].trim();
        } else {
            // Use first meaningful line of doc as summary
            const lines = docBlock.split('\n');
            for (const line of lines) {
                const cleaned = line.replace(/^\s*\*?\s*/, '').trim();
                if (cleaned && !cleaned.startsWith('@')) {
                    summary = cleaned;
                    break;
                }
            }
        }

        // Skip if we already have this function
        if (functions.some(f => f.name === funcName + '()')) continue;

        if (summary) {
            functions.push({
                name: funcName + '()',
                summary: summary
            });
        }
    }

    return { fileSummary, fileTags, functions };
}

function parsePrismaSchema(content: string): { fileSummary: string; fileTags: string[]; functions: FunctionDoc[] } {
    const functions: FunctionDoc[] = [];

    // Extract models with their fields
    const modelPattern = /model\s+(\w+)\s*\{([^}]+)\}/g;
    let match;

    while ((match = modelPattern.exec(content)) !== null) {
        const modelName = match[1];
        const modelBody = match[2];

        // Extract field names and types (first two words on each non-empty, non-comment line)
        const fieldLines = modelBody.trim().split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('//') && !l.startsWith('@@'));

        const fieldsWithTypes: string[] = [];
        for (const line of fieldLines) {
            const parts = line.split(/\s+/);
            const fieldName = parts[0];
            const fieldType = parts[1] || '';

            // Skip relations and index annotations
            if (!fieldName || fieldName.startsWith('@')) continue;

            // Clean up type (remove ? and [] for cleaner display)
            const cleanType = fieldType.replace(/\?$/, '').replace(/\[\]$/, '[]');
            fieldsWithTypes.push(`${fieldName}: ${cleanType}`);
        }

        // Format as HTML list for the desc field
        const fieldListHTML = fieldsWithTypes
            .map(f => `• ${f}`)
            .join('\\n');

        functions.push({
            name: modelName,
            summary: fieldListHTML
        });
    }

    return {
        fileSummary: 'Database schema with Prisma ORM models for Company, Job, Department, Location',
        fileTags: ['Prisma', 'PostgreSQL', 'Schema', 'ORM'],
        functions
    };
}

function generateHTML(docs: FileDoc[]): string {
    const filesJSON = JSON.stringify(docs.reduce((acc, f) => {
        const key = f.path.replace(/[\/\.]/g, '_');
        acc[key] = {
            name: f.name,
            path: f.path,
            icon: f.icon,
            iconClass: f.iconClass,
            summary: f.summary || 'No description available',
            tags: f.tags.length > 0 ? f.tags : ['Undocumented'],
            info: [
                { label: 'Type', value: f.path.endsWith('.prisma') ? 'Schema' : 'TypeScript' },
                { label: 'Functions', value: f.functions.length.toString() }
            ],
            functions: f.functions.map(fn => ({
                name: fn.name,
                desc: fn.summary
            }))
        };
        return acc;
    }, {} as Record<string, any>), null, 2);

    // Generate tree items HTML
    const treeItems = generateTreeHTML(docs);
    const overviewCards = docs.slice(0, 6).map(f => {
        const key = f.path.replace(/[\/\.]/g, '_');
        return `<div class="overview-card" onclick="showFile('${key}')">
            <div class="card-icon ${f.iconClass}">${f.icon}</div>
            <h4>${f.name}</h4>
            <p>${(f.summary || 'No description').substring(0, 60)}...</p>
        </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job Scraper - Project Explorer</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0f0f1a;
            --bg-secondary: #1a1a2e;
            --bg-card: #252542;
            --bg-hover: #2f2f50;
            --accent-blue: #6366f1;
            --accent-purple: #a855f7;
            --accent-pink: #ec4899;
            --accent-green: #10b981;
            --accent-yellow: #f59e0b;
            --accent-cyan: #06b6d4;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --border: rgba(255,255,255,0.08);
            --shadow: 0 20px 40px rgba(0,0,0,0.4);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: var(--bg-primary); color: var(--text-primary); min-height: 100vh; }
        .header { background: linear-gradient(135deg, var(--bg-secondary), var(--bg-card)); padding: 1.5rem 2rem; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
        .header h1 { font-size: 1.5rem; background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display: flex; align-items: center; gap: 0.6rem; }
        .header p { color: var(--text-secondary); margin-top: 0.3rem; font-size: 0.85rem; }
        .header .generated { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem; }
        .main { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 80px); }
        .sidebar { background: var(--bg-secondary); border-right: 1px solid var(--border); padding: 1.2rem; overflow-y: auto; height: calc(100vh - 80px); position: sticky; top: 80px; }
        .sidebar-title { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 0.8rem; padding-left: 0.5rem; }
        .tree { list-style: none; }
        .tree ul { list-style: none; padding-left: 1rem; display: none; margin-top: 0.2rem; }
        .tree li { margin: 0.15rem 0; }
        .tree-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem; border-radius: 8px; cursor: pointer; transition: all 0.15s; font-size: 0.8rem; color: var(--text-secondary); }
        .tree-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .tree-item.active { background: rgba(99, 102, 241, 0.2); color: var(--accent-blue); }
        .tree-item .material-icons-round { font-size: 1rem; transition: transform 0.2s; }
        .tree-item.folder .folder-icon { color: var(--accent-yellow); }
        .tree-item.file .material-icons-round { color: var(--accent-blue); }
        .expanded > ul { display: block; }
        .expanded > .tree-item .arrow { transform: rotate(90deg); }
        .tree-badge { margin-left: auto; font-size: 0.6rem; padding: 0.1rem 0.4rem; border-radius: 12px; background: rgba(236, 72, 153, 0.2); color: var(--accent-pink); }
        .content { padding: 2rem; background: var(--bg-primary); overflow-y: auto; }
        #defaultView { display: block; }
        #fileDetail { display: none; }
        .file-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
        .file-icon-large { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; }
        .file-header h2 { font-size: 1.4rem; }
        .file-header .path { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.3rem; font-family: monospace; }
        .back-btn { margin-left: auto; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; transition: all 0.15s; }
        .back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .file-summary { background: var(--bg-card); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--border); }
        .file-summary h3 { font-size: 0.9rem; margin-bottom: 0.8rem; color: var(--accent-purple); }
        .file-summary p { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; }
        .tags-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; }
        .tag { font-size: 0.7rem; padding: 0.3rem 0.8rem; border-radius: 20px; background: rgba(99, 102, 241, 0.15); color: var(--accent-blue); }
        .functions-section { margin-top: 1.5rem; }
        .functions-section h3 { font-size: 0.9rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
        .functions-section h3 .material-icons-round { color: var(--accent-purple); font-size: 1.2rem; }
        .function-card { background: var(--bg-secondary); border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 0.8rem; border: 1px solid var(--border); transition: all 0.15s; }
        .function-card:hover { border-color: var(--accent-purple); transform: translateX(4px); }
        .function-name { font-weight: 600; font-size: 0.9rem; color: var(--accent-cyan); font-family: monospace; }
        .function-desc { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.4rem; line-height: 1.5; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
        .info-card { background: var(--bg-card); border-radius: 10px; padding: 1rem; border: 1px solid var(--border); text-align: center; }
        .info-card .label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }
        .info-card .value { font-size: 1.1rem; font-weight: 600; margin-top: 0.3rem; color: var(--accent-blue); }
        .overview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.2rem; }
        .overview-card { background: var(--bg-card); border-radius: 14px; padding: 1.3rem; border: 1px solid var(--border); cursor: pointer; transition: all 0.2s; }
        .overview-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); border-color: rgba(99,102,241,0.3); }
        .overview-card h4 { font-size: 0.95rem; margin-bottom: 0.4rem; }
        .overview-card p { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5; }
        .overview-card .card-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 0.8rem; font-size: 1.2rem; }
        .card-icon.pink { background: rgba(236, 72, 153, 0.15); }
        .card-icon.yellow { background: rgba(245, 158, 11, 0.15); }
        .card-icon.cyan { background: rgba(6, 182, 212, 0.15); }
        .card-icon.green { background: rgba(16, 185, 129, 0.15); }
        .card-icon.purple { background: rgba(168, 85, 247, 0.15); }
        .card-icon.blue { background: rgba(99, 102, 241, 0.15); }
        .section-header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.2rem; font-size: 1rem; font-weight: 600; }
        .section-header .material-icons-round { color: var(--accent-purple); }
        @media (max-width: 768px) { .main { grid-template-columns: 1fr; } .sidebar { display: none; } }
    </style>
</head>
<body>
    <header class="header">
        <h1><span class="material-icons-round">folder_special</span> Job Scraper Project Explorer</h1>
        <p>Click any file to see details and functions</p>
        <div class="generated">Auto-generated on ${new Date().toISOString().split('T')[0]}</div>
    </header>
    <div class="main">
        <aside class="sidebar">
            <div class="sidebar-title">Project Structure</div>
            <ul class="tree">
                ${treeItems}
            </ul>
        </aside>
        <main class="content">
            <div id="defaultView">
                <div class="section-header"><span class="material-icons-round">apps</span><span>Select a file to view details</span></div>
                <div class="overview-grid">${overviewCards}</div>
            </div>
            <div id="fileDetail">
                <div class="file-header">
                    <div id="fileIconLarge" class="file-icon-large"></div>
                    <div><h2 id="fileName"></h2><div class="path" id="filePath"></div></div>
                    <button class="back-btn" onclick="showDefault()"><span class="material-icons-round">arrow_back</span>Back</button>
                </div>
                <div class="file-summary"><h3>Summary</h3><p id="fileSummary"></p><div class="tags-row" id="fileTags"></div></div>
                <div class="info-grid" id="fileInfo"></div>
                <div class="functions-section" id="functionsSection"><h3><span class="material-icons-round">functions</span>Functions</h3><div id="functionsList"></div></div>
            </div>
        </main>
    </div>
    <script>
        const files = ${filesJSON};
        function toggleFolder(el) { el.parentElement.classList.toggle('expanded'); }
        function toggleModel(el) { 
            const fields = el.nextElementSibling;
            if (fields) {
                fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
                el.querySelector('.expand-icon').textContent = fields.style.display === 'none' ? '▶' : '▼';
            }
        }
        function showFile(key) {
            const file = files[key];
            if (!file) return;
            document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
            event?.target?.closest('.tree-item')?.classList.add('active');
            document.getElementById('defaultView').style.display = 'none';
            document.getElementById('fileDetail').style.display = 'block';
            document.getElementById('fileIconLarge').className = 'file-icon-large card-icon ' + file.iconClass;
            document.getElementById('fileIconLarge').textContent = file.icon;
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('filePath').textContent = file.path;
            document.getElementById('fileSummary').textContent = file.summary;
            document.getElementById('fileTags').innerHTML = file.tags.map(t => '<span class="tag">' + t + '</span>').join('');
            document.getElementById('fileInfo').innerHTML = file.info.map(i => '<div class="info-card"><div class="label">' + i.label + '</div><div class="value">' + i.value + '</div></div>').join('');
            
            // Check if this is schema file (functions have field lists)
            const isSchema = file.path.includes('.prisma');
            if (isSchema) {
                document.getElementById('functionsList').innerHTML = file.functions.map(f => {
                    const fields = f.desc.split('\\\\n').map(field => '<li style="font-family:monospace;font-size:0.8rem;color:var(--text-secondary);margin:0.3rem 0;">' + field.replace('• ', '') + '</li>').join('');
                    return '<div class="function-card" style="cursor:pointer" onclick="toggleModel(this)"><div class="function-name"><span class="expand-icon" style="margin-right:0.5rem">▶</span>' + f.name + '</div></div><ul style="display:none;list-style:none;padding-left:1.5rem;margin:0 0 0.8rem 0;background:var(--bg-primary);border-radius:8px;padding:0.8rem 1rem;">' + fields + '</ul>';
                }).join('');
            } else {
                document.getElementById('functionsList').innerHTML = file.functions.map(f => '<div class="function-card"><div class="function-name">' + f.name + '</div><div class="function-desc">' + f.desc + '</div></div>').join('');
            }
        }
        function showDefault() {
            document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
            document.getElementById('defaultView').style.display = 'block';
            document.getElementById('fileDetail').style.display = 'none';
        }
    </script>
</body>
</html>`;
}

function generateTreeHTML(docs: FileDoc[]): string {
    // Build folder structure
    const tree: Record<string, any> = {};

    for (const doc of docs) {
        const parts = doc.path.split('/');
        let current = tree;

        for (let i = 0; i < parts.length - 1; i++) {
            const folder = parts[i];
            if (!current[folder]) current[folder] = { __isFolder: true, __children: {} };
            current = current[folder].__children;
        }

        const fileName = parts[parts.length - 1];
        current[fileName] = { __isFile: true, __doc: doc };
    }

    function renderTree(node: Record<string, any>, depth: number = 0): string {
        let html = '';
        const entries = Object.entries(node).sort((a, b) => {
            // Folders first
            const aIsFolder = a[1].__isFolder;
            const bIsFolder = b[1].__isFolder;
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            return a[0].localeCompare(b[0]);
        });

        for (const [name, value] of entries) {
            if (value.__isFolder) {
                const expanded = depth < 2 ? 'expanded' : '';
                html += `<li class="${expanded}">
                    <div class="tree-item folder" onclick="toggleFolder(this)">
                        <span class="material-icons-round arrow">chevron_right</span>
                        <span class="material-icons-round folder-icon">folder</span>
                        <span>${name}</span>
                    </div>
                    <ul>${renderTree(value.__children, depth + 1)}</ul>
                </li>`;
            } else if (value.__isFile) {
                const doc = value.__doc as FileDoc;
                const key = doc.path.replace(/[\/\.]/g, '_');
                const isCore = doc.path.includes('Scraper.ts');
                html += `<li>
                    <div class="tree-item file" onclick="showFile('${key}')">
                        <span class="material-icons-round">description</span>
                        <span>${name}</span>
                        ${isCore ? '<span class="tree-badge">⭐ Core</span>' : ''}
                    </div>
                </li>`;
            }
        }

        return html;
    }

    return `<li class="expanded">
        <div class="tree-item folder" onclick="toggleFolder(this)">
            <span class="material-icons-round arrow">chevron_right</span>
            <span class="material-icons-round folder-icon">folder</span>
            <span>job-scrapper</span>
        </div>
        <ul>${renderTree(tree, 1)}</ul>
    </li>`;
}

export interface GenerateDocsOptions {
    root?: string;
    outFile?: string;
}

/**
 * @summary Generates interactive HTML documentation for all project files
 */
export async function generate(options: GenerateDocsOptions = {}): Promise<{ fileCount: number; outputPath: string }> {
    console.log('📄 Generating documentation...\n');

    const projectRoot = options.root ? path.resolve(options.root) : path.resolve(__dirname, '..');
    const filesToDocument = discoverFiles(projectRoot);
    const docs: FileDoc[] = [];

    for (const file of filesToDocument) {
        const filePath = path.join(projectRoot, file.path);

        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  Skipping ${file.path} (not found)`);
            continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(file.path);

        let parsed;
        if (file.path.endsWith('.prisma')) {
            parsed = parsePrismaSchema(content);
        } else {
            parsed = parseJSDoc(content);
        }

        docs.push({
            name: fileName,
            path: file.path,
            icon: file.icon,
            iconClass: file.iconClass,
            summary: parsed.fileSummary,
            tags: parsed.fileTags,
            functions: parsed.functions
        });

        console.log(`✅ Parsed ${file.path} (${parsed.functions.length} functions)`);
    }

    // Generate HTML
    const html = generateHTML(docs);

    // Write HTML
    const outputPath = options.outFile ? path.resolve(options.outFile) : path.join(projectRoot, 'docs', 'project-explorer.html');
    const docsDir = path.dirname(outputPath);
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, html);

    console.log(`\n🎉 Documentation generated: ${path.relative(projectRoot, outputPath)}`);
    console.log(`   Open with: open ${path.relative(projectRoot, outputPath)}`);

    return { fileCount: docs.length, outputPath };
}

if (require.main === module) {
    generate().catch(console.error);
}
