// Serves /ads.txt. AdSense requires this file at the domain root listing your
// publisher id so Google can verify authorized sellers. It is generated at
// build time from NEXT_PUBLIC_ADSENSE_CLIENT_ID (e.g. "ca-pub-1234..."), so set
// that env var and redeploy to populate it.

export const dynamic = "force-static";

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || "";
  const pub = client.replace(/^ca-/, ""); // "ca-pub-XXXX" -> "pub-XXXX"
  const body =
    pub && pub.startsWith("pub-")
      ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
      : "# Set NEXT_PUBLIC_ADSENSE_CLIENT_ID to your AdSense publisher id to populate ads.txt\n";
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
