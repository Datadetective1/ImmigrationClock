// A small standalone HTML page for the confirm and unsubscribe links. Plain
// and self-contained, like the Pro unsubscribe page, so it renders the same
// from any mail client and needs no client-side code.

export function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function simplePage(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeAttr(title)}</title></head><body style="margin:0;padding:40px 16px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1220"><div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px"><div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;margin-bottom:16px">Immigration<span style="color:#0369a1">Clock</span></div>${body}</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const BUTTON_STYLE =
  "background:#0369a1;color:#fff;border:0;border-radius:8px;padding:11px 18px;font-size:15px;font-weight:600;cursor:pointer";
