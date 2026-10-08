// ==UserScript==
// @name         Claude 生成中チェック（調査用・一時的）
// @namespace    local.claude.streamingcheck
// @version      1.0.0
// @description  縦書き表示パネルが生成中に表示されない原因を調べるための一時的なスクリプトです。画面の上に、生成中の返事がページのどこにあるかを表示します。調べ終わったら削除してください
// @match        https://claude.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BOX_ID = 'cstc-box';

    function short(text, max) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? text.slice(0, max) + '…' : text;
    }

    function cls(el) {
        if (!el) {
            return '-';
        }
        const c = typeof el.className === 'string' ? el.className : '';
        return el.tagName.toLowerCase() + (c ? '.' + short(c, 60).split(' ').join('.') : '');
    }

    function count(root, selector) {
        return (root || document).querySelectorAll(selector).length;
    }

    function inOverlay(el) {
        return !!el.closest('#claude-tategaki-overlay');
    }

    function visibleOutside(selector) {
        return Array.from(document.querySelectorAll(selector)).filter(function (el) {
            return !inOverlay(el);
        });
    }

    function report() {

        const lines = [];

        const streams = visibleOutside('[data-is-streaming]');
        const on = streams.filter(function (el) {
            return el.getAttribute('data-is-streaming') === 'true';
        });

        lines.push('① 生成中の目印: 全' + streams.length + '個 / 生成中=' + on.length + '個');

        const users = visibleOutside('[data-testid="user-message"]');
        const res = visibleOutside('.font-claude-response');
        const msg = visibleOutside('.font-claude-message');

        lines.push('② 自分=' + users.length + ' / response=' + res.length + ' / message=' + msg.length);

        const target = on.length ? on[on.length - 1] : null;

        if (target) {

            lines.push('③ 生成中の入れ物: ' + cls(target));
            lines.push('   中のresponse=' + count(target, '.font-claude-response') +
                ' message=' + count(target, '.font-claude-message') +
                ' std-md=' + count(target, '.standard-markdown') +
                ' prog-md=' + count(target, '.progressive-markdown'));
            lines.push('   外側にresponse: ' + (target.closest('.font-claude-response') ? 'あり' : 'なし') +
                ' / message: ' + (target.closest('.font-claude-message') ? 'あり' : 'なし'));
            lines.push('   文字数=' + (target.innerText || '').length +
                ' 「' + short(target.innerText, 30) + '」');

            const kids = Array.from(target.querySelectorAll('*'))
                .filter(function (el) {
                    return el.children.length === 0 && (el.textContent || '').trim().length > 10;
                });

            const lastLeaf = kids[kids.length - 1];

            if (lastLeaf) {
                let chain = [];
                let node = lastLeaf;
                for (let i = 0; i < 5 && node && node !== target; i++) {
                    chain.push(cls(node));
                    node = node.parentElement;
                }
                lines.push('   最後の文字の親: ' + chain.join(' < '));
            }

        } else {
            lines.push('③ 生成中の入れ物: 見つからない');
        }

        const lastRes = res[res.length - 1] || msg[msg.length - 1];

        if (lastRes) {
            lines.push('④ 最後の返事: ' + cls(lastRes));
            lines.push('   生成中の目印の中: ' + (target && (target.contains(lastRes) || lastRes.contains(target)) ? 'はい' : 'いいえ') +
                ' / 文字数=' + (lastRes.innerText || '').length +
                ' / std-md=' + count(lastRes, '.standard-markdown') +
                ' prog-md=' + count(lastRes, '.progressive-markdown'));
            lines.push('   先頭「' + short(lastRes.innerText, 30) + '」');
        }

        const tail = document.querySelector('#claude-tategaki-scroller .tg-tail');
        const base = document.querySelector('#claude-tategaki-scroller .tg-base');

        lines.push('⑤ 縦書き: 全文=' + (base ? base.querySelectorAll('.tg-msg').length : '-') +
            '件 / 追加分=' + (tail ? tail.querySelectorAll('.tg-msg').length : '-') +
            '件 ' + (tail ? (tail.textContent || '').length : '-') + '字');

        lines.push('⑥ アドレス: ' + short(location.pathname, 50));

        return lines.join('\n');
    }

    function tick() {

        if (!document.body) {
            return;
        }

        let box = document.getElementById(BOX_ID);

        if (!box) {
            box = document.createElement('pre');
            box.id = BOX_ID;
            Object.assign(box.style, {
                position: 'fixed',
                top: '4px',
                left: '4px',
                right: '4px',
                zIndex: 2147483647,
                margin: '0',
                padding: '6px 8px',
                background: 'rgba(0,0,0,0.82)',
                color: '#7CFC9A',
                font: '11px/1.45 monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                borderRadius: '6px',
                pointerEvents: 'none'
            });
            document.body.appendChild(box);
        }

        box.textContent = report();
    }

    setInterval(tick, 500);

})();
