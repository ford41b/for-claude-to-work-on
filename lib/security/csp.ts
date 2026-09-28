/**
 * Content-Security-Policy with a per-request nonce. Scripts: only our nonce'd scripts and what
 * they load ('strict-dynamic' — needed for the YouTube IFrame API). Frames: YouTube's official
 * players only. Media/images/connections: this origin and the Supabase project.
 */
export function buildCsp(nonce: string, options: { supabaseUrl: string; isDev: boolean }): string {
  const supabase = new URL(options.supabaseUrl).origin;
  const supabaseWs = supabase.replace(/^http/, "ws");
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:${options.isDev ? ` 'unsafe-eval'` : ""}`,
    // React/Radix/Tiptap set inline style attributes; a nonce would disable 'unsafe-inline'.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://i.ytimg.com https://*.ytimg.com ${supabase}`,
    `media-src 'self' blob: ${supabase}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabase} ${supabaseWs}`,
    `frame-src https://www.youtube-nocookie.com https://www.youtube.com`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(options.isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
