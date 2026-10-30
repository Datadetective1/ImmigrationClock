// =============================================================================
// FEWER STEPS BETWEEN A READER AND WHAT THEY CAME FOR
//
// Each assertion pins one step that was removed, so it cannot quietly come
// back: a newsletter button greyed out until two extra inputs were answered,
// a pricing page that showed the free list before the Pro price on a phone,
// and a new subscriber left on a confirmation with nothing to do next.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PulseSignupForm } from "@/components/PulseSignupForm";

const read = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");

describe("the newsletter form", () => {
  const html = renderToStaticMarkup(createElement(PulseSignupForm, { provider: "self", placement: "test" }));

  it("can be submitted with nothing but an email address", () => {
    // The button used to stay disabled until a language was picked AND a box
    // was ticked, with nothing saying why.
    const button = html.match(/<button type="submit"[^>]*>/)?.[0] ?? "";
    expect(button).not.toMatch(/\sdisabled(=""|\s|>)/);
    expect(html).not.toContain('type="checkbox"');
  });

  it("starts with a language already chosen, and keeps all four one tap away", () => {
    expect(html).toMatch(/aria-checked="true"[^>]*lang="en"|lang="en"[^>]*aria-checked="true"/);
    for (const label of ["English", "Español", "Français", "العربية"]) expect(html).toContain(label);
  });

  it("says how often, how to stop and links the privacy policy under the button", () => {
    expect(html).toMatch(/One email a week/);
    expect(html).toMatch(/Unsubscribe from any email/);
    expect(html).toContain('href="/privacy"');
  });

  it("sends consent only because the reader pressed Subscribe", () => {
    const form = read("src/components/PulseSignupForm.tsx");
    // Inside the submit handler, after validation, never on render.
    const submit = form.slice(form.indexOf("async function onSubmit"), form.indexOf('if (status.kind === "done")'));
    expect(submit).toContain("consent: true");
  });
});

describe("/pricing on a phone", () => {
  const page = read("src/app/pricing/page.tsx");

  it("shows Pro before the free list on small screens, and Free first from md up", () => {
    expect(page).toMatch(/aria-labelledby="plan-free"/);
    expect(page).toMatch(/className="panel panel-pad order-2 md:order-1" aria-labelledby="plan-free"/);
    expect(page).toMatch(/order-1 [^"]*md:order-2" aria-labelledby="plan-pro"/);
  });

  it("keeps the renewal and tax disclosure beside the buttons", () => {
    const flat = page.replace(/\s+/g, " ");
    expect(flat).toMatch(/Renews automatically until you cancel/);
    expect(flat).toMatch(/sales tax is shown before you pay/);
  });

  it("keeps the roadmap out of the Pro card", () => {
    const pro = page.slice(page.indexOf('aria-labelledby="plan-pro"'), page.indexOf('aria-labelledby="faq-heading"'));
    expect(pro).not.toMatch(/later\.(length|map)/);
    expect(page).toMatch(/Is more coming\?/);
  });
});

describe("after paying", () => {
  it("points a new subscriber at the one thing that makes alerts work", () => {
    const activation = read("src/components/AccountActivation.tsx");
    expect(activation).toContain('href="/following"');
    expect(activation).toMatch(/Choose what to follow/);
    // And a failed confirmation names an address rather than "contact us".
    expect(activation).toContain("<ContactLink />");
  });
});
