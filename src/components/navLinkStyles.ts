/**
 * Look of the header's text links (Dashboard, Documentation), shared by the app
 * navigation bar and the signed-out home page bar so they always match.
 *
 * - Hover: the text turns dark and bold (see NavLinkLabel, which keeps the
 *   width fixed).
 * - Current page: dark, bold text plus a 2 px dark line on the bar's bottom
 *   edge (over the line the bar already has). No line on hover.
 * - Utilities are marked important (`!`): a global `button { all: unset }` rule
 *   (injected by react-audio-spectrogram-player) is unlayered and would
 *   otherwise strip them.
 */
const NAV_LINK_BASE =
  "relative! box-border! inline-flex! h-full! items-center! py-0! whitespace-nowrap! cursor-pointer! px-2! max-[359px]:px-1.5! sm:px-3! text-sm! font-medium! font-ibm-sans! transition-colors! duration-150! " +
  "after:absolute! after:inset-x-1.5! sm:after:inset-x-2.5! after:-bottom-px! after:h-0.5! after:rounded-full! after:bg-gray-900! " +
  "after:origin-center! after:scale-x-0! after:transition-transform! after:duration-200!";

const NAV_LINK_IDLE = "text-gray-500! hover:text-gray-900! hover:font-semibold!";
const NAV_LINK_ACTIVE =
  "text-gray-900! font-semibold! after:bg-gray-900! after:scale-x-100!";

export const navLinkClass = (active: boolean) =>
  `${NAV_LINK_BASE} ${active ? NAV_LINK_ACTIVE : NAV_LINK_IDLE}`;
