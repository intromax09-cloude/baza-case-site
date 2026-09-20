/**
 * POST /api/lead — замовлення з каталогу BAZA CASE.
 * Тіло: {name, phone, email, shipping, city, branch, note, payment, total, items:[{name,color,model,qty,price}], source}
 * Шле повідомлення в Telegram. Змінні оточення Cloudflare Pages:
 *   TG_TOKEN   — токен бота від @BotFather   (тип Secret)
 *   TG_CHAT_ID — chat id отримувача          (тип Secret)
 * Нагадування: змінні вступають у силу тільки після редеплою.
 */

const MAX_BODY = 20000;
const MAX_ITEMS = 30;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clip(s, n) {
  s = String(s == null ? '' : s).trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('uk-UA') + ' грн' : '—';
}

export async function onRequestPost({ request, env }) {
  if (!env.TG_TOKEN || !env.TG_CHAT_ID) {
    return new Response('Not configured', { status: 500 });
  }

  let d;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return new Response('Too large', { status: 413 });
    d = JSON.parse(raw);
  } catch (e) {
    return new Response('Bad request', { status: 400 });
  }

  // пастка для ботів: живі люди це поле не бачать
  if (d.website) return new Response('OK', { status: 200 });

  const name = clip(d.name, 120);
  const phone = clip(d.phone, 60);
  if (!name || phone.replace(/\D/g, '').length < 9) {
    return new Response('Empty', { status: 400 });
  }

  const items = Array.isArray(d.items) ? d.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return new Response('No items', { status: 400 });

  const num = 'BC-' + String(Date.now()).slice(-6);

  const lines = ['<b>🛍 Нове замовлення ' + num + '</b>', ''];

  for (const it of items) {
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    const sum = Number(it.price) ? money(Number(it.price) * qty) : 'ціна за запитом';
    lines.push(
      '• <b>' + esc(clip(it.name, 120)) + '</b> — ' +
      esc(clip(it.color, 40)) + ' · ' + esc(clip(it.model, 40)) +
      ' × ' + qty + ' = ' + esc(sum)
    );
  }

  lines.push('');
  lines.push('<b>Разом:</b> ' + esc(money(d.total)));
  lines.push('<b>Оплата:</b> ' + esc(clip(d.payment, 80)));
  lines.push('');
  lines.push('<b>Клієнт:</b> ' + esc(name));
  lines.push('<b>Телефон:</b> ' + esc(phone));
  if (clip(d.email, 1)) lines.push('<b>E-mail:</b> ' + esc(clip(d.email, 120)));
  lines.push('<b>Доставка:</b> ' + esc(clip(d.shipping, 80)));
  if (clip(d.city, 1) || clip(d.branch, 1)) {
    lines.push('<b>Куди:</b> ' + esc(clip(d.city, 80)) + ', ' + esc(clip(d.branch, 160)));
  }
  if (clip(d.note, 1)) lines.push('<b>Коментар:</b> ' + esc(clip(d.note, 900)));
  lines.push('');
  lines.push('<i>' + esc(clip(d.source || 'baza-case', 80)) + '</i>');

  const res = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TG_CHAT_ID,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  if (!res.ok) return new Response('Telegram error', { status: 502 });

  return new Response(JSON.stringify({ ok: true, order: num }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
