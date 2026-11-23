/**
 * 访问密码门（纯前端）。
 *
 * 注意：这是「门面」级别的保护 —— 页面 HTML 仍然在静态产物里，
 * 懂技术的人查看源码即可绕过。如果内容确实敏感，需要真正的服务端鉴权
 * （Cloudflare Access / Netlify Password 等），GitHub Pages 无法提供。
 *
 * 密码不会以明文出现，只存 SHA-256 摘要。
 */
(() => {
  const STORAGE_KEY = "yg-lock";
  const HASH =
    "91184d14d60f736fb0fc97645e19a0accd0d56fd444877d86d87dd64853aa681";

  const root = document.documentElement;

  const unlock = () => {
    delete root.dataset.locked;
    document.querySelector(".lock-screen")?.remove();
  };

  // 之前验证过就直接放行
  if (localStorage.getItem(STORAGE_KEY) === "1") {
    unlock();
    return;
  }

  const screen = document.createElement("div");
  screen.className = "lock-screen";
  screen.innerHTML = `
    <form class="lock-card" autocomplete="off">
      <p class="lock-kicker">鄞高 2402</p>
      <h2 class="lock-title">需要密码才能进入</h2>
      <p class="lock-hint">本站为班级内部页面</p>
      <label class="lock-label" for="lock-input">访问密码</label>
      <input
        id="lock-input"
        class="lock-input"
        type="password"
        name="password"
        placeholder="输入密码"
        required
        autocomplete="current-password"
      />
      <p class="lock-error" hidden>密码不正确，请再试一次</p>
      <button class="lock-submit" type="submit">进入</button>
    </form>
  `;

  document.body.appendChild(screen);

  const form = screen.querySelector("form");
  const input = screen.querySelector("input");
  const error = screen.querySelector(".lock-error");

  const digest = async (text) => {
    const data = new TextEncoder().encode(text);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buffer)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  if (!window.crypto?.subtle) {
    error.hidden = false;
    error.textContent = "当前环境无法校验密码，请通过 https 访问";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const value = input.value.trim();
    if (!value || !window.crypto?.subtle) return;

    const hashed = await digest(value);

    if (hashed === HASH) {
      localStorage.setItem(STORAGE_KEY, "1");
      unlock();
      return;
    }

    error.hidden = false;
    input.value = "";
    input.focus();

    // 重新触发抖动动画
    screen.classList.remove("is-shaking");
    void screen.offsetWidth;
    screen.classList.add("is-shaking");
  });

  window.setTimeout(() => input.focus(), 60);
})();
