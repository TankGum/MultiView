# Chrome Web Store Listing Draft

## Name

`MultiView Any Video`

## Short Description

Watch up to 12 videos from your open tabs in one synchronized dashboard.

## Full Description

MultiView helps you watch multiple video tabs in one place.

How it works:
- Open the extension popup and choose the tabs you want.
- Click `View Selected` to open the MultiView dashboard.
- Watch selected videos in a single grid layout.
- Drag and drop video tiles in the dashboard to reorder.

Built for:
- Monitoring live streams from multiple sources
- Comparing content side by side
- Keeping selected video tabs visible in one workspace

Notes:
- Supports up to 12 selected tabs.
- Works on user-selected tabs only.
- Does not upload your videos to external servers.

## Category Suggestion

`Productivity`

## Permission Justification (for CWS form)

- `tabs`: read open tabs so users can choose which ones to include.
- `scripting`: inject capture script on selected tabs when needed.
- `storage`: save selected tab IDs and order.
- `host_permissions (<all_urls>)`: needed because users may select videos from many different websites.

## Support URL

Use a public URL pointing to your support page (example: GitHub issues page).

## Privacy Policy URL

Use a public URL pointing to your privacy policy page (template in `PRIVACY_POLICY.md`).
