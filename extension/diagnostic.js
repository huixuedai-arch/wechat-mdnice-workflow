/* Bounded DOM diagnostics. Never reads cookies, page globals or private APIs. */
(() => {
  const clean = value => String(value || '').replace(/https?:\/\/[^\s<>"')]+/g, '[URL omitted]').replace(/(?:access_token|token|cookie)\s*[=:]\s*[^\s,;]+/gi, '[credential omitted]').slice(0, 160);
  const shown = el => {
    if (!el || !el.getClientRects().length) return false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (n.hidden || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  globalThis.WechatDiagnostic = async ({ expandAddMenu = false } = {}) => {
    const ids = new WeakMap(), media = new Map(); let next = 0;
    const id = el => { if (!ids.has(el)) ids.set(el, ++next); return ids.get(el); };
    const mediaId = url => {
      try { const u = new URL(url, location.href); if (!/(^|\.)qpic\.cn$/.test(u.hostname)) return 'other-image';
        const key = u.hostname + u.pathname.replace(/\/(0|640|1080)$/, '');
        if (!media.has(key)) media.set(key, 'wechat-image-' + (media.size + 1)); return media.get(key);
      } catch { return 'invalid-image'; }
    };
    const editable = el => !!el.closest('[contenteditable=true],textarea');
    const brief = el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const out = { node: id(el), tag: el.tagName, class: clean(el.getAttribute('class')), visible: shown(el),
        rect: [r.x, r.y, r.width, r.height].map(Math.round), display: s.display, visibility: s.visibility, opacity: s.opacity, pointerEvents: s.pointerEvents };
      for (const k of ['id', 'role', 'type', 'accept', 'placeholder', 'data-placeholder', 'aria-label', 'aria-expanded', 'aria-controls', 'aria-hidden', 'maxlength']) {
        if (el.hasAttribute(k)) out[k] = clean(el.getAttribute(k));
      }
      if ('disabled' in el) out.disabled = el.disabled;
      if ('multiple' in el) out.multiple = el.multiple;
      // Only direct labels within upload/image controls, never article prose or input values.
      if (!editable(el) && el.closest('[class*=image-selector],[class*=pop-opr],[class*=upload],.tpl_dropdown_menu')) {
        const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ').trim(); if (t) out.label = clean(t);
      }
      if (el.tagName === 'IMG') out.image = mediaId(el.getAttribute('data-src') || el.getAttribute('src'));
      if (s.backgroundImage !== 'none') out.backgroundImages = [...s.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)].map(m => mediaId(m[1]));
      if (el.matches('input[type=file]')) out.files = [...el.files].map(f => ({ name: clean(f.name), size: f.size, type: f.type }));
      if (el.matches('input:not([type=file]),textarea,[contenteditable=true]')) out.textLength = ('value' in el ? el.value : el.textContent).length;
      return out;
    };
    const chain = el => { const a = []; for (let p = el; p && a.length < 12; p = p.parentElement) a.push(brief(p)); return a; };
    const snapshot = () => {
      let remaining = 1600;
      const tree = (el, depth = 0) => {
        const b = brief(el); remaining--;
        if (depth < 9 && remaining > 0 && !editable(el)) b.children = [...el.children].slice(0, 100).map(c => remaining > 0 ? tree(c, depth + 1) : { truncated: true });
        return b;
      };
      const roots = [...document.querySelectorAll('.image-selector,.pop-opr,.js_upload_btn_container,.tpl_dropdown_menu,[role=dialog],.weui-desktop-dialog')];
      const components = roots.filter(e => !roots.some(p => p !== e && p.contains(e))).slice(0, 24).map(e => remaining > 0 ? tree(e) : { truncated: true });
      return { at: new Date().toISOString(), inputs: [...document.querySelectorAll('input[type=file]')].slice(0, 40).map(e => ({ node: id(e), ancestors: chain(e) })),
        addButtons: [...document.querySelectorAll('.image-selector__bottom-add')].map(brief),
        gallery: [...document.querySelectorAll('.image-selector__bottom-list-item')].map(e => tree(e)),
        editors: [...document.querySelectorAll('input:not([type=file]),textarea,[contenteditable=true]')].filter(shown).slice(0, 80).map(brief), components, truncated: remaining <= 0 };
    };
    const timeline = [];
    const observer = new MutationObserver(records => {
      for (const m of records) {
        if (timeline.length >= 180) break;
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el || !(el.closest('[class*=image-selector],[class*=pop-opr],[class*=upload],.tpl_dropdown_menu,[role=dialog],.weui-desktop-dialog') || [...m.addedNodes].some(n => n.nodeType === 1 && n.matches('[class*=pop-opr],[class*=upload]')))) continue;
        timeline.push({ ms: Math.round(performance.now() - start), target: id(el), class: clean(el.getAttribute('class')), type: m.type, attribute: m.attributeName,
          added: [...m.addedNodes].filter(n => n.nodeType === 1).slice(0, 8).map(n => ({ node: id(n), tag: n.tagName, class: clean(n.getAttribute('class')) })) });
      }
    });
    const start = performance.now(), phases = [{ phase: 'before', ...snapshot() }];
    let action = 'read-only'; observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded'] });
    try {
      if (expandAddMenu) {
        const buttons = [...document.querySelectorAll('.image-selector__bottom-add')].filter(shown);
        if ([...document.querySelectorAll('.pop-opr__item')].some(e => shown(e) && e.querySelector('input[type=file]'))) action = 'not-opened: upload menu already visible';
        else if (buttons.length !== 1) action = 'not-opened: visible add buttons = ' + buttons.length;
        else if (buttons[0].querySelector('input[type=file]') || buttons[0].matches('input,label')) action = 'not-opened: direct file picker';
        else {
          buttons[0].click(); action = 'opened-add-menu-once';
          for (const delay of [0, 150, 500, 1000]) { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); phases.push({ phase: 'after-add-menu', elapsedMs: Math.round(performance.now() - start), ...snapshot() }); }
        }
      }
      return { schemaVersion: 1, action, phases, timeline, privacy: 'No cookies, page URLs, image URLs, article prose, input values or file bytes are collected.' };
    } catch (error) { return { schemaVersion: 1, action, error: clean(error.message), phases, timeline }; }
    finally { observer.disconnect(); }
  };
})();
