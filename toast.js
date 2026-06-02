/**
 * ZeroOne Toast / Confirm system
 * Replaces browser alert() and confirm() with styled bottom-center toasts.
 *
 * Usage:
 *   toast('message')               // neutral
 *   toast('message', 'success')    // green
 *   toast('message', 'error')      // red
 *   toast('message', 'info')       // default
 *   toastConfirm('message').then(ok => { if (ok) ... })
 */

(function () {
    // ── Inject styles once ──────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        #zt-container {
            position: fixed;
            bottom: 28px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            z-index: 9999;
            pointer-events: none;
            width: max-content;
            max-width: calc(100vw - 32px);
        }
        .zt-toast {
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 18px;
            background: #111111;
            border: 1px solid rgba(255,255,255,0.08);
            color: #d4d4d8;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 12px;
            letter-spacing: 0.02em;
            max-width: 420px;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1);
            white-space: pre-wrap;
            word-break: break-word;
        }
        .zt-toast.zt-show {
            opacity: 1;
            transform: translateY(0);
        }
        .zt-toast.zt-hide {
            opacity: 0;
            transform: translateY(6px);
        }
        .zt-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .zt-info  .zt-dot { background: #71717a; }
        .zt-success .zt-dot { background: #10b981; }
        .zt-error .zt-dot { background: #f87171; }
        .zt-warn  .zt-dot { background: #f59e0b; }

        .zt-info  { border-color: rgba(113,113,122,0.2); }
        .zt-success { border-color: rgba(16,185,129,0.25); }
        .zt-error { border-color: rgba(248,113,113,0.25); }
        .zt-warn  { border-color: rgba(245,158,11,0.25); }

        /* Confirm dialog */
        #zt-confirm-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.55);
            backdrop-filter: blur(2px);
            z-index: 10000;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 28px;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }
        #zt-confirm-overlay.zt-show {
            opacity: 1;
            pointer-events: auto;
        }
        #zt-confirm-box {
            background: #111111;
            border: 1px solid rgba(255,255,255,0.08);
            padding: 16px 20px;
            width: max-content;
            max-width: calc(100vw - 32px);
            min-width: 260px;
            transform: translateY(12px);
            transition: transform 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        #zt-confirm-overlay.zt-show #zt-confirm-box {
            transform: translateY(0);
        }
        #zt-confirm-msg {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 12px;
            color: #a1a1aa;
            margin-bottom: 14px;
            line-height: 1.6;
            letter-spacing: 0.02em;
        }
        .zt-confirm-btns {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        .zt-confirm-btns button {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            padding: 7px 16px;
            cursor: pointer;
            border: 1px solid;
            transition: background 0.15s, color 0.15s;
        }
        #zt-cancel-btn {
            background: transparent;
            border-color: rgba(255,255,255,0.1);
            color: #71717a;
        }
        #zt-cancel-btn:hover { border-color: rgba(255,255,255,0.25); color: #d4d4d8; }
        #zt-ok-btn {
            background: #ffffff;
            border-color: #ffffff;
            color: #000000;
        }
        #zt-ok-btn:hover { background: #e4e4e7; }
        #zt-ok-btn.zt-danger {
            background: transparent;
            border-color: rgba(248,113,113,0.4);
            color: #f87171;
        }
        #zt-ok-btn.zt-danger:hover { background: rgba(248,113,113,0.1); }
    `;
    document.head.appendChild(style);

    // ── Container ───────────────────────────────────────────────────
    function getContainer() {
        let c = document.getElementById('zt-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'zt-container';
            document.body.appendChild(c);
        }
        return c;
    }

    // ── toast(msg, type, duration) ──────────────────────────────────
    window.toast = function (msg, type = 'info', duration = 3000) {
        const container = getContainer();
        const el = document.createElement('div');
        el.className = `zt-toast zt-${type}`;
        el.innerHTML = `<span class="zt-dot"></span><span>${msg}</span>`;
        container.appendChild(el);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('zt-show'));
        });

        setTimeout(() => {
            el.classList.add('zt-hide');
            el.addEventListener('transitionend', () => el.remove(), { once: true });
        }, duration);
    };

    // ── toastConfirm(msg, danger) → Promise<boolean> ────────────────
    window.toastConfirm = function (msg, danger = true) {
        return new Promise((resolve) => {
            let overlay = document.getElementById('zt-confirm-overlay');
            if (overlay) overlay.remove();

            overlay = document.createElement('div');
            overlay.id = 'zt-confirm-overlay';
            overlay.innerHTML = `
                <div id="zt-confirm-box">
                    <p id="zt-confirm-msg">${msg}</p>
                    <div class="zt-confirm-btns">
                        <button id="zt-cancel-btn">Cancel</button>
                        <button id="zt-ok-btn" class="${danger ? 'zt-danger' : ''}">Confirm</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => overlay.classList.add('zt-show'));
            });

            function close(result) {
                overlay.classList.remove('zt-show');
                overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
                resolve(result);
            }

            document.getElementById('zt-ok-btn').addEventListener('click', () => close(true));
            document.getElementById('zt-cancel-btn').addEventListener('click', () => close(false));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        });
    };
})();
