/* Focus Builder - small helpers (DOM, ids, download, zip, toast) */
(function (FB) {
	'use strict';

	/** Tiny hyperscript: h('div', {class:'x', onclick:fn}, child, [children], 'text') */
	FB.h = function h(tag, attrs, ...kids) {
		const el = document.createElement(tag);
		let deferredValue;
		let hasValue = false;
		if (attrs) {
			for (const k in attrs) {
				const v = attrs[k];
				if (v === null || v === undefined || v === false) continue;
				if (k === 'class') el.className = v;
				else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.slice(0, 2) === '--') el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
				else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
				else if (k === 'html') el.innerHTML = v;
				else if (k === 'value') { deferredValue = v; hasValue = true; }
				else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
				else el.setAttribute(k, v === true ? '' : v);
			}
		}
		const add = (c) => {
			if (c === null || c === undefined || c === false) return;
			if (Array.isArray(c)) c.forEach(add);
			else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
		};
		kids.forEach(add);
		if (hasValue) el.value = deferredValue; // after options exist, for <select>
		return el;
	};

	FB.uid = () => 'f' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
	FB.clone = (o) => JSON.parse(JSON.stringify(o));
	FB.slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	FB.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
	FB.clamp = (v, a, b) => Math.min(b, Math.max(a, v));

	FB.toast = function (msg, kind) {
		const host = document.getElementById('toasts');
		if (!host) return;
		const t = FB.h('div', { class: 'toast ' + (kind || '') }, msg);
		host.appendChild(t);
		setTimeout(() => t.classList.add('out'), 2600);
		setTimeout(() => t.remove(), 3100);
	};

	FB.download = function (filename, data, mime) {
		const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = FB.h('a', { href: url, download: filename });
		document.body.appendChild(a);
		a.click();
		setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
	};

	FB.copyText = async function (text) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (e) {
			const ta = FB.h('textarea', { style: { position: 'fixed', left: '-9999px' } });
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			let ok = false;
			try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
			ta.remove();
			return ok;
		}
	};

	/* ---------- minimal ZIP writer (store, no compression) ---------- */
	const CRC_TABLE = (() => {
		const t = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c >>> 0;
		}
		return t;
	})();
	function crc32(bytes) {
		let c = 0xFFFFFFFF;
		for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
		return (c ^ 0xFFFFFFFF) >>> 0;
	}
	/** files: [{name, data: string|Uint8Array}] -> Blob */
	FB.makeZip = function (files) {
		const enc = new TextEncoder();
		const parts = [];
		const central = [];
		let offset = 0;
		const d = new Date();
		const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
		const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
		for (const f of files) {
			const name = enc.encode(f.name);
			const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
			const crc = crc32(data);
			const lh = new DataView(new ArrayBuffer(30));
			lh.setUint32(0, 0x04034b50, true);
			lh.setUint16(4, 20, true);
			lh.setUint16(6, 0x0800, true); // UTF-8 names
			lh.setUint16(8, 0, true);
			lh.setUint16(10, dosTime, true);
			lh.setUint16(12, dosDate, true);
			lh.setUint32(14, crc, true);
			lh.setUint32(18, data.length, true);
			lh.setUint32(22, data.length, true);
			lh.setUint16(26, name.length, true);
			lh.setUint16(28, 0, true);
			parts.push(lh.buffer, name, data);
			const ch = new DataView(new ArrayBuffer(46));
			ch.setUint32(0, 0x02014b50, true);
			ch.setUint16(4, 20, true);
			ch.setUint16(6, 20, true);
			ch.setUint16(8, 0x0800, true);
			ch.setUint16(10, 0, true);
			ch.setUint16(12, dosTime, true);
			ch.setUint16(14, dosDate, true);
			ch.setUint32(16, crc, true);
			ch.setUint32(20, data.length, true);
			ch.setUint32(24, data.length, true);
			ch.setUint16(28, name.length, true);
			ch.setUint32(42, offset, true);
			central.push(ch.buffer, name);
			offset += 30 + name.length + data.length;
		}
		let centralSize = 0;
		central.forEach((c) => { centralSize += c.byteLength !== undefined ? c.byteLength : c.length; });
		const end = new DataView(new ArrayBuffer(22));
		end.setUint32(0, 0x06054b50, true);
		end.setUint16(8, files.length, true);
		end.setUint16(10, files.length, true);
		end.setUint32(12, centralSize, true);
		end.setUint32(16, offset, true);
		return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
	};
})(window.FB = window.FB || {});
