# Chrome Web Store listing: ImmigrationClock Visa Bulletin Dates

Everything to paste into the Chrome Web Store developer dashboard.
Screenshots and the promo tile are in `extension/store/`.

## Store listing tab

**Name** (from the manifest)
ImmigrationClock: Visa Bulletin Dates

**Summary** (from the manifest, 132 characters max)
Your green card category's Visa Bulletin dates in one click, with an alert when ImmigrationClock adds a new month.

**Category**
Tools

**Language**
English (United States)

**Description**

```
ImmigrationClock shows the current U.S. Visa Bulletin dates for the one green card category you care about, so you don't have to dig through the State Department's tables every month.

Pick your category (EB-1 to EB-5, or F1 to F4) and your country of chargeability once. Then click the icon to see:

• The final action date and the date for filing from the latest bulletin
• How each date moved since the month before
• A link to the official State Department bulletin
• A link to ImmigrationClock's wait time page for your category, where one exists

How alerts work
Once a day the extension checks ImmigrationClock for a new bulletin month. Every month is typed by hand from the official State Department PDF and checked cell by cell before it appears, so a new month shows up here some days after the State Department publishes it. When it does, the icon shows NEW and, if you leave notifications on, you get one notification with your dates.

Privacy
No account, no sign-in, no tracking and no analytics. Your category and country stay in your browser. The extension reads no web pages and asks for no access to the sites you visit.

ImmigrationClock is an independent publisher of public U.S. immigration data. It is not affiliated with the U.S. Department of State or USCIS, and it is not legal advice. Always confirm your dates against the official bulletin before you file.
```

**Graphic assets**
- Store icon: `icons/icon128.png`
- Screenshots (1280x800): `store/screenshot-1-dates.png`, `store/screenshot-2-setup.png`
- Small promo tile (440x280): `store/promo-tile-440x280.png`

**Official URL / homepage**
https://immigrationclock.com/visa-bulletin

**Support URL**
https://immigrationclock.com/about

## Privacy practices tab

**Single purpose**
Shows the current U.S. Visa Bulletin dates for the green card category and country the user picks, and flags when a new bulletin month is available.

**Permission justifications**
- `storage`: Saves the category and country the user picked, their notification setting, the last bulletin month they saw, and a copy of the public bulletin file so the popup opens instantly.
- `alarms`: Schedules one check a day for a new bulletin month.
- `notifications`: Shows one notification when a new bulletin month is added. The user can turn it off in the popup.

**Host permissions**
None.

**Remote code**
No, I am not using remote code. (All code ships in the package. The extension downloads one JSON data file.)

**Data usage**
Tick none of the data types. The extension collects no user data.
Tick all three certifications (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL**
https://immigrationclock.com/privacy

## Distribution tab

- Payments: Free
- Visibility: Public
- Regions: All regions
