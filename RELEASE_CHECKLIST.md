# MultiView Release Checklist (Chrome Web Store)

## 1) Code + Package

- [x] `manifest_version: 3`
- [x] Extension icons added (`16`, `32`, `48`, `128`)
- [x] Remove unused permission (`offscreen`)
- [ ] Bump version in `public/manifest.json` and `package.json` for each release
- [ ] Run release checks:
  - `npm run release:check`
  - `npm run package:zip`
- [ ] Confirm upload artifact exists:
  - `release/multiview-v<version>.zip`

## 2) Store Listing Assets

- [ ] App name
- [ ] Short description (target <= 132 chars)
- [ ] Full description
- [ ] At least 1 screenshot (recommended desktop popup + dashboard states)
- [ ] Optional promo images (small/large/marquee) if you plan featured placement

## 3) Compliance + Policies

- [ ] Privacy Policy URL (hosted publicly, not local file)
- [ ] Single-purpose statement clearly matches behavior
- [ ] Permission justifications:
  - `tabs`: list/select opened tabs
  - `scripting`: inject content script when tab not ready
  - `storage`: store selected tab order/selection
  - `host_permissions <all_urls>`: capture videos across user-selected sites
- [ ] Data disclosure section in CWS dashboard completed

## 4) Final Manual Verification

- [ ] Fresh install in a clean Chrome profile
- [ ] Select tabs in popup
- [ ] Open dashboard and verify streams play
- [ ] Drag to reorder in dashboard
- [ ] Verify no critical console errors
