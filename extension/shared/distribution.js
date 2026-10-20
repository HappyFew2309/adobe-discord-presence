/*
 * Distribution settings — fill these in before you publish.
 *
 * appIds: the Discord "Application ID" for each app. Public values (anyone who sees
 *         your status can find them), so they're safe to ship. NEVER put a Client
 *         Secret, bot token or public key here — Rich Presence doesn't use them.
 *         Users can still override any of these with their own ID in the panel.
 *
 * githubRepo: "owner/repo" where you publish releases. The auto-updater checks
 *         https://github.com/<githubRepo>/releases/latest. Leave empty to disable.
 */
(function () {
  var dist = {
    appIds: {
      PPRO: '1562119622390452324', // "Premiere Pro"
      AEFT: '1562119934593470525', // "After Effects"
      PHXS: '1562138396627964057', // "Photoshop"
      ILST: '1562138935977709668', // "Illustrator"
      AUDT: '1562139315151044744', // "Audition"
      AME: '1562139577383124994'   // "Media Encoder"
    },
    githubRepo: 'HappyFew2309/adobe-discord-presence'
  };
  if (typeof window !== 'undefined') window.DP_DIST = dist;
  else if (typeof module === 'object' && module && module.exports) module.exports = dist;
})();
