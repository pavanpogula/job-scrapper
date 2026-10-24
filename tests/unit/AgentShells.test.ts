/**
 * @file AgentShells.test.ts
 * @summary Parity test validating agent shells, roles, skills symlinks, rules, and file size budgets across Claude Code and Google Antigravity environments.
 * @tags parity, agents, claude, antigravity, rules, skills
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROLES = [
    'scraper-architect',
    'run-reviewer',
    'scraper-bugfixer',
    'api-cache',
    'frontend',
    'docs-release-keeper'
];

const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Extracts frontmatter string values from markdown text.
 */
function parseFrontmatter(content: string): { name?: string; description?: string; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
        return { body: content };
    }
    const yaml = match[1];
    const body = match[2];

    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    const descMatch = yaml.match(/^description:\s*(.+)$/m);

    const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : undefined;
    const description = descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : undefined;

    return { name, description, body };
}

describe('P4-T07: Agent Shells Parity Test', () => {
    test('every role in roster has canonical role file, claude shell, and antigravity shell', () => {
        const rosterContent = fs.readFileSync(path.join(ROOT_DIR, 'documentation/agents/roster.md'), 'utf-8');

        for (const role of ROLES) {
            expect(rosterContent).toContain(role);

            const roleFilePath = path.join(ROOT_DIR, `documentation/agents/roles/${role}.md`);
            const claudeShellPath = path.join(ROOT_DIR, `.claude/agents/${role}.md`);
            const agyShellPath = path.join(ROOT_DIR, `.agents/agents/${role}.md`);

            expect(fs.existsSync(roleFilePath)).toBe(true);
            expect(fs.existsSync(claudeShellPath)).toBe(true);
            expect(fs.existsSync(agyShellPath)).toBe(true);
        }
    });

    test('both shells for each role have identical name and description', () => {
        for (const role of ROLES) {
            const claudeContent = fs.readFileSync(path.join(ROOT_DIR, `.claude/agents/${role}.md`), 'utf-8');
            const agyContent = fs.readFileSync(path.join(ROOT_DIR, `.agents/agents/${role}.md`), 'utf-8');

            const claudeFm = parseFrontmatter(claudeContent);
            const agyFm = parseFrontmatter(agyContent);

            expect(claudeFm.name).toBe(role);
            expect(agyFm.name).toBe(role);
            expect(claudeFm.description).toBeDefined();
            expect(agyFm.description).toBeDefined();
            expect(claudeFm.description).toBe(agyFm.description);
        }
    });

    test('every shell body references its canonical role file', () => {
        for (const role of ROLES) {
            const claudeContent = fs.readFileSync(path.join(ROOT_DIR, `.claude/agents/${role}.md`), 'utf-8');
            const agyContent = fs.readFileSync(path.join(ROOT_DIR, `.agents/agents/${role}.md`), 'utf-8');

            const expectedRef = `documentation/agents/roles/${role}.md`;
            expect(claudeContent).toContain(expectedRef);
            expect(agyContent).toContain(expectedRef);
        }
    });

    test('every entry in .claude/skills/ is a symlink resolving into .agents/skills/', () => {
        const claudeSkillsDir = path.join(ROOT_DIR, '.claude/skills');
        const entries = fs.readdirSync(claudeSkillsDir);

        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            const fullPath = path.join(claudeSkillsDir, entry);
            const stat = fs.lstatSync(fullPath);
            expect(stat.isSymbolicLink()).toBe(true);

            const realPath = fs.realpathSync(fullPath);
            expect(realPath).toContain(path.normalize('.agents/skills'));
        }
    });

    test('every .agents/rules/*.md file has a valid trigger, and glob rules specify globs', () => {
        const rulesDir = path.join(ROOT_DIR, '.agents/rules');
        const rules = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));

        expect(rules.length).toBeGreaterThan(0);
        const validTriggers = ['always_on', 'model_decision', 'glob', 'manual'];

        for (const file of rules) {
            const content = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
            const triggerMatch = content.match(/trigger:\s*(\w+)/);
            expect(triggerMatch).not.toBeNull();
            const trigger = triggerMatch![1];
            expect(validTriggers).toContain(trigger);

            if (trigger === 'glob') {
                expect(content).toMatch(/globs:/);
            }
        }
    });

    test('file byte budgets for AGENTS.md and context.md are respected', () => {
        const agentsSize = fs.statSync(path.join(ROOT_DIR, 'AGENTS.md')).size;
        const contextSize = fs.statSync(path.join(ROOT_DIR, 'documentation/agents/context.md')).size;

        expect(agentsSize).toBeLessThanOrEqual(6144);
        expect(contextSize).toBeLessThanOrEqual(6144);
        expect(agentsSize + contextSize).toBeLessThanOrEqual(12288);
    });

    test('CLAUDE.md is <= 40 lines and imports AGENTS.md and context.md', () => {
        const content = fs.readFileSync(path.join(ROOT_DIR, 'CLAUDE.md'), 'utf-8');
        const lines = content.split('\n');

        expect(lines.length).toBeLessThanOrEqual(40);
        expect(content).toContain('@AGENTS.md');
        expect(content).toContain('@documentation/agents/context.md');
    });

    test('.claude/settings.local.json is gitignored and not tracked', () => {
        const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf-8');
        expect(gitignore).toContain('.claude/settings.local.json');

        const tracked = execSync('git ls-files .claude/settings.local.json', { cwd: ROOT_DIR })
            .toString()
            .trim();
        expect(tracked).toBe('');
    });
});
