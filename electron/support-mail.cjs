const SUPPORT_EMAIL = 'ralf+apex@boltshauser.com'
const MAX_MAILTO_URL_LENGTH = 1800

function mailtoUrl(subject, body) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function buildSupportMailto({ bundleText, version, platform }) {
  const subject = `Apex for LMU ${version} debug logs (${platform})`
  const introduction = [
    'Hi Ralf,',
    '',
    'I am having an issue with Apex for LMU. The complete redacted debug bundle is below.',
    '',
    bundleText,
  ].join('\n')
  const completeUrl = mailtoUrl(subject, introduction)
  if (completeUrl.length <= MAX_MAILTO_URL_LENGTH) {
    return { url: completeUrl, includedInBody: true }
  }

  const clipboardIntroduction = [
    'Hi Ralf,',
    '',
    'I am having an issue with Apex for LMU.',
    '',
    'Apex copied the complete redacted debug bundle to my clipboard. I will paste it below with Ctrl+V before sending:',
    '',
    '[PASTE DEBUG LOGS HERE]',
  ].join('\n')
  return { url: mailtoUrl(subject, clipboardIntroduction), includedInBody: false }
}

module.exports = { SUPPORT_EMAIL, MAX_MAILTO_URL_LENGTH, buildSupportMailto }
