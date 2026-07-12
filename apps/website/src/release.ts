const repository = "https://github.com/ralfboltshauser/apex-lmu";

export const RELEASE = {
  version: __APEX_VERSION__,
  tag: `v${__APEX_VERSION__}`,
  repository,
  page: `${repository}/releases/tag/v${__APEX_VERSION__}`,
  installer: `${repository}/releases/download/v${__APEX_VERSION__}/Apex-for-LMU-Setup-${__APEX_VERSION__}.exe`,
  portable: `${repository}/releases/download/v${__APEX_VERSION__}/Apex-for-LMU-${__APEX_VERSION__}-win.zip`,
  checksums: `${repository}/releases/download/v${__APEX_VERSION__}/SHA256SUMS.txt`,
} as const;
