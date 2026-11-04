# Mobile device testing

A checklist for checking the phone layout on real devices before a release.
Browser emulation (responsive mode, simulated touch) is useful during
development, but it does not reproduce safe areas, the on-screen keyboard,
rubber-band scrolling, native pickers or stylus hover, so run this on hardware.

Record each run on [#211](https://github.com/Simplificatedd/JobApplicationTracker/issues/211)
with the device, OS version, browser and date, and open a separate issue for
each failure.

## Devices

Cover at least:

| Device | Browser | Why |
| --- | --- | --- |
| iPhone with a notch or Dynamic Island, current iOS | Safari | Safe areas, keyboard, `overflow: hidden` scroll lock |
| Android phone, current Android | Chrome | Touch events, native pickers |
| Tablet narrower than 768px in portrait (iPad mini at 744px, or a small Android tablet), in both orientations | Safari or Chrome | Rotation across the 768px breakpoint. Most other iPads are 768px or wider in portrait and never show the phone layout; on those, resize with Split View or Stage Manager instead |
| A pen device if available (Apple Pencil, S Pen, Surface Pen) | Default browser | Pen taps and hover |
| An iPhone on iOS 15.4–15.x, if available | Safari | Known scroll-lock limit (see below) |

Use a test account with a few applications, at least one archived application,
an upcoming interview, a resume and a cover letter.

## Checklist

Mark each item pass or fail. "Phone" means under 768px wide.

### Layout and safe areas

- [ ] No sideways scrolling on any page in portrait.
- [ ] The top bar clears the notch or Dynamic Island; the bottom bar clears the home indicator.
- [ ] In landscape on a notched phone, content clears the side insets.
- [ ] Text is readable without zooming; nothing is cut off with "…" that you need to read.

### Navigation

- [ ] The bottom bar switches pages; the current page is highlighted.
- [ ] **More** opens a sheet with Resumes, Cover Letters and Settings; the sheet closes with its close button and by tapping outside.
- [ ] With the sheet open, rotate a tablet to landscape (at least 768px): the sheet closes and the desktop navigation shows.
- [ ] With a keyboard attached, repeat that rotation: focus lands on the current page in the desktop navigation. Then hide the navigation in landscape with the toggle at the top left, rotate to portrait, open **More** and rotate back: focus lands on the navigation toggle.

### Applications and Archive

- [ ] The summary tiles fit two by two and the first application rows are visible without scrolling.
- [ ] Search, clear search, sort and **Filters** work; the Filters count badge updates and **Reset** clears it.
- [ ] While Filters is open, the page behind does not scroll; the filter list does.
- [ ] Tapping a row opens its details.
- [ ] On a tablet in landscape, open **Columns**, rotate to portrait (under 768px), then close it with a keyboard: focus lands on **Filters**.

### Application details

- [ ] The panel fills the screen; the page behind does not scroll, even when dragging on the header.
- [ ] The status picker changes the status.
- [ ] The ⋯ menu opens and its actions work; tapping outside closes it.
- [ ] **Activity** expands and collapses.
- [ ] **Edit**: the keyboard does not hide the field being typed in; Save and Cancel stay reachable.
- [ ] Editing and then closing asks to discard changes; **Keep editing** keeps them.

### Add job

- [ ] The form fills the screen; Save stays disabled until a job title is entered.
- [ ] Date fields open the native date picker; selects open the native list.
- [ ] Fields do not zoom the page when focused (iOS).

### Notifications

- [ ] The bell opens a full-screen panel; the page behind does not scroll.
- [ ] Notification actions work and the panel closes with its close button.

### Resumes and Cover Letters

- [ ] Upload from the device works; Preview opens the file; Download saves it.
- [ ] Edit and Delete work; Delete asks for confirmation.

### Settings

- [ ] The section strip scrolls sideways and highlights the current section.
- [ ] The Applications table section and the navigation-layout setting are hidden on phones and still show on a tablet in landscape.
- [ ] Switches, the contacts choice, day counts and quick location save.

### Analytics

- [ ] The summary tiles fit two by two.
- [ ] Tapping a chart item (treemap tile, donut segment, bar, radar point, heatmap day, status flow) shows its details and they stay after lifting the finger.
- [ ] Tapping a line chart selects the tapped period.
- [ ] Scrolling the page with a finger that starts on a chart leaves no highlight behind.
- [ ] Hints say "tap", not "hover".
- [ ] The status flow and activity calendar scroll sideways inside their cards when they are wider than the screen.
- [ ] With a pen: tapping keeps details; hovering (where supported) shows them, and hovering away clears them.

### Accessibility

- [ ] VoiceOver (iOS) and TalkBack (Android): pages, dialogs and the bottom bar are announced with sensible names; dialogs keep focus inside until closed.
- [ ] With a Bluetooth keyboard: Tab reaches every control, Escape closes dialogs and menus, and focus returns to what opened them.

## Known limitation: scroll lock on older iOS

The page behind full-screen panels and dialogs is locked with
`html:has(...) { overflow: hidden; }`. iOS Safari before 16 ignores
`overflow: hidden` on the page for touch scrolling, so on iOS 15.4–15.x the page
behind can still be scrolled. Taps and focus still cannot reach it, because the
panels are native modal dialogs. No fallback is in place; see
[#210](https://github.com/Simplificatedd/JobApplicationTracker/issues/210) for the
reasoning. On an iOS 15.4–15.x device, record whether this is a real problem.

Safari before 15.4 is not supported: it has no `<dialog>` element, which every
panel, sheet and dialog in the app relies on.
