# Your data in Allezou

This page explains what Allezou stores, why, for how long, and who can see it.
It's written to be read in full: if something here isn't clear, that's a flaw
in this page, not in your attention.

## Who's responsible

**Michael Urbina**, resident in Petit-Lancy.

For any question or request:

> [contact@allezou.ch](mailto:contact@allezou.ch)  
> Michael Urbina

This is processed under Switzerland's revised Federal Act on Data Protection (FADP).

## What Allezou stores

Allezou processes personal data, some of which concerns children. That's why
this page exists.

| Data | Why it exists | How long | Who sees it |
|---|---|---|---|
| Your email address | It's your only way to sign in: Allezou has no password | As long as your account exists | Only you. It's never shown to other members |
| The name you choose to display | So others recognize you. You write it freely: "Sophie," "Léa's mom," whatever you like | As long as your account exists | Members of your circles |
| Your children's **first name**, and nothing else | To show who's at an outing: "we're at the park with Matéo" | As long as you keep them on your account | Members of your circles, when you mark the child present |
| Your circles, and who's in them | It's the heart of the product | As long as the circle exists | Members of that circle |
| The name you see a circle under, if it differs from the original | So "Classe 4P" can read as "Jules's class" for you | As long as you keep it | Only you. Other members see the original name |
| Which child is linked to which circle | So an outing without your oldest doesn't get sent to their class | As long as you keep it | You, and the child's other parent if they have one. Other members of the circle don't see it |
| Your outings: a place chosen from a list, an end time, and optionally a note of up to 140 characters | This is what you share | **Deleted 24 hours after its end time** | Only the circles you chose when you posted it |
| Your sign-ups for agenda activities | So others know their child will find someone there | **Deleted 24 hours after the activity ends**, just like an outing | Only the circles you chose |
| Your notification settings | So you're only disturbed when you've asked to be | As long as your account exists | Only you |
| The words you watch for in the agenda: "pool," "judo" | To notify you when a published activity contains one | As long as you keep them | Only you. They're never shown to anyone and are used for nothing else |
| Your phone's technical address for notifications | To send you notifications | As long as you keep notifications on | No one: it's a technical identifier |
| A log of permission changes (who let whom into a circle, who removed whom) | So a security issue can be understood | **12 months** | The person responsible, if there's an incident |

## What Allezou doesn't store

Each of these absences is a commitment. The code that keeps them can be
shown on request.

- **No password.** None exists anywhere, so none can ever leak.
- **No GPS location, ever.** An outing is a place you choose from a list,
  with an end time. Allezou never asks your phone for its location, whether
  the app is open or running in the background.
- **No movement history.** A past outing is deleted, not archived. Not even
  the person responsible can piece together where a family went last month,
  not even as a statistic.
- **No messaging.** There's no chat thread, no private message, no comment.
- **No audience-measurement tools.** No Google Analytics, no advertising
  pixel, no third-party tracker.
- **No sales, no commercial sharing.** Your data is never sold or shared.
- **About your children, nothing but a first name.** Members of a circle
  already know the children in question; the app has nothing to add. No
  last name, **no age or date of birth**, no photo, no gender, no school,
  no class, no health information.

## Who sees what, exactly

This is the most important point, and it comes down to a single rule:

> **A person sees your outing if and only if, at the moment they look, they
> are a member of one of the circles you sent that outing to, and you
> haven't cut the link between you.**

Here's what follows from that:

- Someone who **leaves a circle** immediately stops seeing its outings.
- Someone who **isn't in the circle** sees nothing, and doesn't even learn
  who belongs to it.
- You can **uncheck someone** in a circle. They no longer see your outings,
  and you no longer see theirs. Nothing tells them it happened.
- When several families join the same outing, **the list only shows you
  the people you already share a circle with**. A family that joined
  through the neighborhood doesn't appear to a classmate's parent who
  doesn't know them.
- **Notifications** follow exactly the same rule: you can't be notified
  about something you wouldn't see on screen. And the message sent to your
  phone doesn't say who or where, only the circle's name, so a locked
  screen left on a table gives nothing away.
- **Agenda alerts** are different, because the agenda is public: everyone
  sees the same activities. What matters there isn't who has the right to
  know, it's who asked to be told. The message names the word you're
  watching for, which is yours alone, and never the activity's title.

This rule is written in a single place in the code, and checked by a
series of tests that go through each case one by one. It's a proof that
can be shown on request.

## Where the data is

On servers located **in Switzerland**, at **Infomaniak**. It never leaves
the country.

Three technical exceptions, none of which involve any personal data:

- the agenda is fed from public Geneva websites (City of Geneva,
  municipalities);
- pages from those sites that don't publish a structured agenda are read
  by an artificial-intelligence service to extract dates from them.
  **Only public web pages are sent to it**, never any data about you. What
  it extracts is then checked against the original page: a date, title,
  or place that doesn't match doesn't make it onto the agenda, and waits
  for a human check instead;
- the address of a park or hall is sent once to OpenStreetMap, to look up
  its coordinates so a map link lands on the right spot. It's the address
  of a public place, sent from our server. **Never yours, and never what
  you're looking at.**

## Who else is involved

Two intermediaries are needed for Allezou to reach you. Neither one learns
what you do in the app.

- **Notifications go through your phone's notification service** — Apple
  on iPhone, Google on Android. It's the only path a phone allows: no app
  is exempt from it. The message is handed to them **encrypted**: they
  relay it without being able to read it. They know a message was sent to
  your device, and when.
- **The email that signs you in goes through Infomaniak**, our host, in
  Switzerland. It contains nothing but your sign-in link.

There's also the map, which you trigger yourself — that's the next section.

## The map

The agenda and "We're heading out" offer a map of places. It comes from
Google Maps — the map most parents already know how to read — and a map
loaded by default would be a third-party tracker, exactly what this page
rules out. So it follows one simple rule: **nothing goes to Google without
an action from you**.

- **As long as you don't ask for the map, Google sees nothing.** It isn't
  loaded with the page: nothing goes out until you tap "View on the map."
- **The moment you ask for it**, your browser downloads the map from
  Google, just as if you'd opened Google Maps yourself. Google then sees
  the area shown — public places in Geneva — but never who is looking at
  which list: it learns neither who you are on Allezou, nor which outing
  or activity you were reading, nor which page you came from.
- The ↗ links next to places follow the same rule: they open Google Maps
  the moment you tap them, never before.
- **Your location is never involved.** The map shows places, not you.
  Allezou never asks your phone for its location — the map doesn't change
  that, and the browser wouldn't allow it anyway. Your location is
  therefore never sent anywhere: not to Google, not to Allezou.

## Your rights

You can, at any time:

- **see** all the data concerning you;
- **correct** what's wrong;
- **delete** your account, which erases your data;
- **remove** a child, which erases their first name;
- **ask for an explanation** of anything on this page.

Write to [contact@allezou.ch](mailto:contact@allezou.ch). You also have the
right to contact the Federal Data Protection and Information Commissioner
(FDPIC).

## If this page changes

Any change will be announced in the app before it takes effect. A change
that would expand what's collected, or who can see it, will never be
applied silently.

---

*Last updated: 16 August 2026.*
