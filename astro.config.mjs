import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import md3Theme from 'starlight-theme-md3';

export default defineConfig({
    site: 'https://posts.yg2402.cn',
    integrations: [
        starlight({
            title: 'My Docs',
            markdown: {
                processor: 'satteri'
            },
            customCss: ['./src/styles/global.css'],
            head: [
                {
                    tag: 'style',
                    content: `
                        .img-zoom-mask {
                            position: fixed;
                            inset: 0;
                            background: rgba(0,0,0,0.85);
                            z-index: 9999;
                            display: none;
                            align-items: center;
                            justify-content: center;
                            cursor: zoom-out;
                        }
                        .img-zoom-img {
                            max-width: 90vw;
                            max-height: 90vh;
                            cursor: grab;
                            transition: transform 0.1s;
                        }
                    `
                },
                {
                    tag: 'script',
                    content: `
document.addEventListener('DOMContentLoaded', () => {
    const mask = document.createElement('div');
    mask.className = 'img-zoom-mask';
    const zoomImg = document.createElement('img');
    zoomImg.className = 'img-zoom-img';
    mask.appendChild(zoomImg);
    document.body.appendChild(mask);

    document.querySelectorAll('main img').forEach(img => {
        img.style.cursor = 'zoom-in';
        img.onclick = () => {
            zoomImg.src = img.src;
            mask.style.display = 'flex';
        }
    })
    mask.onclick = () => mask.style.display = 'none';

    let scale = 1;
    zoomImg.addEventListener('wheel', e => {
        e.preventDefault();
        scale += e.deltaY > 0 ? -0.1 : 0.1;
        scale = Math.max(0.5, Math.min(scale, 3));
        zoomImg.style.transform = \`scale(\${scale})\`;
    })
})
                    `
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