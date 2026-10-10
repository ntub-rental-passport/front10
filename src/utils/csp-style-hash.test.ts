import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nginxFiles = ['deploy/nginx-tls.conf.example', 'deploy/test/nginx.test.conf'];

function collectSourceFiles(directory: string): string[] {
  if (!exists(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(filePath);
    return /\.(vue|ts)$/.test(entry.name) ? [filePath] : [];
  });
}

function exists(filePath: string): boolean {
  try {
    readdirSync(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('reka-ui inline style CSP hash', () => {
  it('keeps the SelectViewport style hash and CSP directives in sync', () => {
    const selectViewportPath = path.join(root, 'node_modules/reka-ui/dist/Select/SelectViewport.js');
    const selectViewport = readFileSync(selectViewportPath, 'utf8');
    const styleMatch = selectViewport.match(/createTextVNode\(("(?:\\.|[^"\\])*(?:scrollbar-width)(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*(?:scrollbar-width)(?:\\.|[^'\\])*')\)/);

    expect(styleMatch, '無法從 reka-ui SelectViewport.js 找到含 scrollbar-width 的 createTextVNode 字串；請檢查套件更新並更新 hash 測試。').not.toBeNull();
    const css = JSON.parse(styleMatch![1]);
    const hash = createHash('sha256').update(css, 'utf8').digest('base64');
    const expectedSource = `'sha256-${hash}'`;

    for (const relativePath of nginxFiles) {
      const config = readFileSync(path.join(root, relativePath), 'utf8');
      const enforcedCsp = config.split('\n').find((line) => line.includes('add_header Content-Security-Policy "'));
      expect(enforcedCsp, `${relativePath} 缺少強制執行的 Content-Security-Policy。`).toBeDefined();
      expect(enforcedCsp, `reka-ui 的 SelectViewport 樣式已變更，請把 ${relativePath} nginx CSP 的 hash 更新為 '${expectedSource.slice(1, -1)}'。`).toContain(expectedSource);
      expect(config, `${relativePath} 不應再使用 unsafe-inline。`).not.toContain('unsafe-inline');
      expect(config, `${relativePath} 不應再設定 Content-Security-Policy-Report-Only。`).not.toContain('Content-Security-Policy-Report-Only');
    }
  });

  it('does not use other reka-ui components that inject style elements', () => {
    const files = [
      ...collectSourceFiles(path.join(root, 'src')),
      ...collectSourceFiles(path.join(root, 'components')),
    ].filter((filePath) => !filePath.endsWith(`${path.sep}csp-style-hash.test.ts`)
      && !filePath.includes(`${path.sep}components${path.sep}ui${path.sep}scroll-area${path.sep}`));
    const forbiddenImport = /(?:import\s+(?:type\s+)?([\s\S]*?)\s+from\s*['"]reka-ui['"]|import\s*['"]@\/components\/ui\/scroll-area['"])/g;
    const forbiddenNames = /\b(?:ScrollArea(?:Root|Viewport|Scrollbar|Thumb|Corner)?|Combobox(?:Anchor|Arrow|Cancel|Content|Group|Input|Item|ItemIndicator|Label|Portal|Root|Trigger|Viewport)?|ScrollAreaViewport|ComboboxViewport|Viewport)\b/;
    const offending = files.filter((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      if (source.includes('@/components/ui/scroll-area')) return true;
      return [...source.matchAll(forbiddenImport)].some((match) => forbiddenNames.test(match[1] ?? ''));
    });

    expect(offending, `發現會插入 <style> 的 reka-ui 元件：${offending.map((filePath) => path.relative(root, filePath)).join(', ')}。請先計算對應樣式的 hash 並加入 nginx CSP。`).toEqual([]);
  });
});
