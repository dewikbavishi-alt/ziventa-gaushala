/**
 * Where to send someone after they sign in.
 *
 * Only same-site paths are accepted. Taking a full URL here would let anyone
 * craft a sign-in link for your site that quietly bounces your customer off to
 * theirs immediately afterwards - with the trust of having started on a real
 * Ziventa page. `//evil.com` is rejected as well as `https://evil.com`,
 * because a browser reads a protocol-relative path as another host.
 */
export function safeNext(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '/account';
  if (!value.startsWith('/') || value.startsWith('//')) return '/account';
  return value;
}
