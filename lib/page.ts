export const SETUP_COOKIE = "board_setup";

const BAR_HEIGHT = 34;

const setupBar = `<style>.shell,.boot{height:calc(100dvh - ${BAR_HEIGHT}px)!important}</style>
<div style="height:${BAR_HEIGHT}px;display:flex;align-items:center;justify-content:center;gap:16px;border-bottom:1px solid var(--hairline);font-size:12px;color:var(--muted)">
<span>Your coding agents aren't on the board yet.</span>
<a href="/setup" style="color:var(--bright);text-decoration:underline;text-underline-offset:3px">Set them up (2 min)</a>
<a href="/setup/done" style="color:var(--faint)">dismiss</a>
</div>`;

export function boardPage(html: string, showSetup: boolean): string {
  const named = html.replace('<meta name="inspect-named" content="1">', '<meta name="inspect-named" content="0">');
  return showSetup ? named.replace('<div id="root">', `${setupBar}<div id="root">`) : named;
}
