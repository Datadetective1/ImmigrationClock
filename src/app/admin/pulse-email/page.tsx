import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { PulseEmailPreview } from "@/components/PulseEmailPreview";
import email from "@/lib/generated/pulse-email.json";

export const metadata = buildMetadata({
  title: "Weekly Pulse Email",
  description: "Preview and copy the auto-generated weekly Immigration Pulse email.",
  path: "/admin/pulse-email",
  noindex: true,
});

export default function PulseEmailAdminPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Operator tool"
        title="Weekly Pulse email"
        description="Auto-generated from the change feed on every build. Copy the subject and body, paste into your email provider, and send. Connect a provider via NEXT_PUBLIC_NEWSLETTER_ENDPOINT to capture subscribers."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/admin/pulse-email", label: "Pulse email" },
        ]}
      />
      <div className="container-page max-w-4xl py-10">
        <PulseEmailPreview
          subject={email.subject}
          html={email.html}
          text={email.text}
          markdown={email.markdown}
          generatedAt={email.generatedAt}
        />
      </div>
    </div>
  );
}
