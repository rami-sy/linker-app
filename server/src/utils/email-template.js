/**
 * Builds a branded Linker HTML email.
 *
 * @param {object} opts
 * @param {string} opts.title      - Shown in the colored header band
 * @param {string} opts.body       - Main paragraph (HTML allowed)
 * @param {string} [opts.footer]   - Small print below the card (optional)
 * @param {string} [opts.cta]      - Call-to-action button label (optional)
 * @param {string} [opts.ctaUrl]   - URL for the CTA button (optional)
 * @returns {string} Full HTML string
 */
function buildEmailHtml({ title, body, footer, cta, ctaUrl }) {
  const teal = "#0a97b9";
  const bg = "#f1f5f9";
  const cardBg = "#ffffff";
  const textMain = "#1e293b";
  const textMuted = "#64748b";
  const borderColor = "#e2e8f0";

  const ctaButton =
    cta && ctaUrl
      ? `
      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${ctaUrl}"
           style="display:inline-block;background:${teal};color:#ffffff;text-decoration:none;
                  font-size:15px;font-weight:600;padding:12px 32px;border-radius:10px;
                  letter-spacing:0.3px;">
          ${cta}
        </a>
      </div>`
      : "";

  const footerBlock = footer
    ? `<p style="margin:20px 0 0;font-size:13px;color:${textMuted};text-align:center;">${footer}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${bg};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="max-width:520px;background:${cardBg};border-radius:16px;
                      overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);
                      border:1px solid ${borderColor};">

          <!-- Teal accent bar -->
          <tr>
            <td style="height:4px;background:${teal};font-size:0;">&nbsp;</td>
          </tr>

          <!-- Logo + Brand -->
          <tr>
            <td style="padding:28px 36px 12px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:8px;">
                <div style="width:36px;height:36px;border-radius:10px;background:${teal};
                            display:inline-block;vertical-align:middle;"></div>
                <span style="font-size:22px;font-weight:700;color:${textMain};
                             vertical-align:middle;letter-spacing:-0.5px;">Linker</span>
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;">
              <hr style="border:none;border-top:1px solid ${borderColor};margin:0;"/>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding:24px 36px 4px;">
              <h1 style="margin:0;font-size:20px;font-weight:700;color:${textMain};">
                ${title}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:12px 36px 8px;font-size:15px;line-height:1.65;color:${textMain};">
              ${body}
            </td>
          </tr>

          <!-- CTA button (optional) -->
          <tr>
            <td style="padding:0 36px;">
              ${ctaButton}
            </td>
          </tr>

          <!-- Footer note -->
          <tr>
            <td style="padding:16px 36px 28px;">
              ${footerBlock}
            </td>
          </tr>

          <!-- Bottom bar -->
          <tr>
            <td style="padding:14px 36px;background:#f8fafc;border-top:1px solid ${borderColor};
                       text-align:center;">
              <p style="margin:0;font-size:12px;color:${textMuted};">
                © ${new Date().getFullYear()} Linker &nbsp;·&nbsp;
                <a href="https://linker.land" style="color:${teal};text-decoration:none;">linker.land</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Builds the plain-text fallback for an email.
 */
function buildEmailText({ title, body, footer }) {
  // Strip basic HTML tags for plain text
  const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  let text = `${title}\n${"─".repeat(40)}\n\n${plain(body)}\n`;
  if (footer) text += `\n${plain(footer)}`;
  text += "\n\n— Linker · linker.land";
  return text;
}

module.exports = { buildEmailHtml, buildEmailText };
