/**
 * 给 Markdown 渲染出的 <img> 补上 loading="lazy" 和 decoding="async"。
 *
 * 纯 Markdown 语法无法给图片加 HTML 属性，而一页一百张远程图片同时请求时，
 * 浏览器只能排队，绝大部分会长时间空白。改成懒加载后，只在图片接近视口时才请求。
 *
 * 零依赖实现，避免依赖未声明的 unist 工具包。
 */
export default function rehypeLazyImages() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'element' && node.tagName === 'img') {
        node.properties = node.properties || {};

        if (!node.properties.loading) node.properties.loading = 'lazy';
        if (!node.properties.decoding) node.properties.decoding = 'async';
      }

      if (node.children) node.children.forEach(walk);
    };

    walk(tree);
  };
}
