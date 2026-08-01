import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import md3Theme from 'starlight-theme-md3';

export default defineConfig({
    site: 'https://posts.yg2402.cn',
    integrations: [
        starlight({
            title: 'My Docs',
            customCss: [
                './src/styles/global.css',
                './src/styles/image-lightbox.css',
                './src/styles/custom-cursor.css',
            ],
            head: [
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
                }
            ],
            plugins: [
                md3Theme()
            ],
            social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
            sidebar: [
                {
                    label: '简介',
                    items: [
                        { label: '关于本站', slug: '简介/about' }
                    ]
                },
                {
                    label: '合照',
                    items: [
                        { label: '合照合集', slug: '合照/合照合集' }
                    ]
                }
            ]
        })
    ]
});