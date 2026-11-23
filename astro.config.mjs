import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import md3Theme from 'starlight-theme-md3';
import rehypeLazyImages from './rehype-lazy-images.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_DIR = fileURLToPath(new URL('./src/content/docs', import.meta.url));

/** 数字前缀只用于排序，不显示在标题里：01-xxx.md → xxx */
function splitPrefix(name) {
    const matched = name.match(/^(\d+)[\s._-]+(.+)$/);
    return matched
        ? { order: Number(matched[1]), name: matched[2] }
        : { order: Number.MAX_SAFE_INTEGER, name };
}

/**
 * 读取 frontmatter。
 * sidebarLabel 可覆盖侧边栏显示名（页面标题太长时用），没写就退回 title，
 * 再没有就用文件名。
 */
function readMeta(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (front) {
            const pick = (key) => {
                const line = front[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
                return line ? line[1].trim().replace(/^['"]|['"]$/g, '') : null;
            };
            return { title: pick('title'), sidebarLabel: pick('sidebarLabel') };
        }
    } catch {
        // 读不到就用文件名兜底
    }
    return { title: null, sidebarLabel: null };
}

/**
 * 扫描 src/content/docs 自动生成侧边栏：
 * 新建文件夹就是分组，新建 md 就是条目，不需要再改这个文件。
 * 以 _ 或 . 开头的文件/目录会被忽略（可用于草稿）。
 */
function scanDocs(dir = '') {
    const abs = path.join(DOCS_DIR, dir);
    if (!fs.existsSync(abs)) return [];

    const entries = fs
        .readdirSync(abs, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.') && !entry.name.startsWith('_'));

    const nodes = [];

    for (const entry of entries) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            const items = scanDocs(rel);
            if (items.length) nodes.push({ kind: 'group', name: entry.name, items });
            continue;
        }

        if (!/\.mdx?$/.test(entry.name)) continue;

        const stem = entry.name.replace(/\.mdx?$/, '');
        if (stem === 'index') continue; // 首页不进侧边栏

        const meta = readMeta(path.join(abs, entry.name));

        nodes.push({
            kind: 'page',
            name: stem,
            item: {
                label: meta.sidebarLabel ?? meta.title ?? splitPrefix(stem).name,
                // Starlight 的 URL 是小写的，slug 同步小写才能匹配
                slug: (dir ? `${dir}/${stem}` : stem).toLowerCase(),
            },
        });
    }

    nodes.sort((a, b) => {
        const left = splitPrefix(a.name);
        const right = splitPrefix(b.name);
        if (left.order !== right.order) return left.order - right.order;
        return left.name.localeCompare(right.name, 'zh');
    });

    return nodes.map((node) =>
        node.kind === 'group'
            ? { label: splitPrefix(node.name).name, items: node.items }
            : node.item
    );
}

const sidebar = scanDocs();

export default defineConfig({
    site: 'https://posts.yg2402.cn',
    markdown: {
        rehypePlugins: [rehypeLazyImages],
    },
    integrations: [
        starlight({
            title: 'My Docs',
            customCss: [
                './src/styles/global.css',
                './src/styles/image-lightbox.css',
                './src/styles/custom-cursor.css',
                './src/styles/photo-flow.css',
                './src/styles/glass.css',
                './src/styles/lock.css',
            ],
            head: [
                // 图床预连接：省掉首图的 DNS + TLS 握手（约 100–300ms）
                {
                    tag: 'link',
                    attrs: { rel: 'preconnect', href: 'https://ss1.tupinayun.cn' },
                },
                {
                    tag: 'link',
                    attrs: { rel: 'dns-prefetch', href: 'https://ss1.tupinayun.cn' },
                },
                // 首屏就用内联脚本决定是否上锁，避免内容先闪一下再被遮住
                {
                    tag: 'script',
                    content:
                        "if(localStorage.getItem('yg-lock')!=='1'){document.documentElement.dataset.locked=''}",
                },
                {
                    tag: 'script',
                    attrs: { src: '/scripts/lock.js', type: 'module' },
                },
                {
                    tag: 'script',
                    attrs: {
                        src: '/scripts/image-lightbox.js',
                        type: 'module',
                    },
                },
                {
                    tag: 'script',
                    attrs: {
                        src: '/scripts/custom-cursor.js'
                    }
                },
                {
                    tag: 'script',
                    attrs: {
                        src: '/scripts/photo-flow.js',
                        type: 'module',
                    },
                }
            ],
            plugins: [
                md3Theme()
            ],
            social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
            // 由上面的 scanDocs() 自动生成，新增文件无需再改这里
            sidebar,
        })
    ]
});
