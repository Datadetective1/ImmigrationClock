// =============================================================================
// EMAIL STYLE — the site's light theme, inline, for every Pro email
//
// Email clients drop <style> and ignore CSS variables, so the redesign's light
// palette is repeated here as literal colours. One place, so the alert email
// and the weekly summary cannot drift apart.
// =============================================================================

export const EMAIL_COLOR = {
  ink: "#0b1220",
  body: "#334155",
  muted: "#556274",
  line: "#e5e7eb",
  page: "#f6f7f9",
  accent: "#0369a1",
  amber: "#b45309",
} as const;

export const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeEmailHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The wordmark: "ImmigrationClock Pro", as in the site header. */
export function emailWordmark(): string {
  const C = EMAIL_COLOR;
  return `<div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;color:${C.ink}">Immigration<span style="color:${C.accent}">Clock</span> <span style="font-family:${EMAIL_FONT};font-weight:600;color:${C.muted}">Pro</span></div>`;
}

export function emailPill(text: string, color: string): string {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border:1px solid ${color}33;border-radius:999px;font-size:12px;font-weight:600;color:${color}">${escapeEmailHtml(text)}</span>`;
}

export function emailButton(href: string, text: string): string {
  return `<a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:${EMAIL_COLOR.accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${escapeEmailHtml(text)}</a>`;
}
