# SMS opt-in trace — list UiFFMg

Report only. No consent wording was changed and nobody was added to a
list by hand.

## What the numbers say

List `UiFFMg` — "SMS List", created 2025-06-18, **`opt_in_process:
double_opt_in`**.

Weekly, from Klaviyo metric aggregates (`Subscribed to List` grouped by
list, and `Subscribed to Text Messaging Marketing`, metric `UR5u4v`):

| week of | SMS List adds | Subscribed to Text Messaging Marketing |
|---------|---------------|----------------------------------------|
| Aug 31  | 11            | 11                                     |
| Sep 7   | 9             | 9                                      |
| Sep 14  | 0             | 0                                      |
| Sep 21  | 0             | 0                                      |
| Sep 28  | 6             | 0                                      |
| Oct 5   | 2             | 0                                      |
| Oct 12  | 0             | 0                                      |
| Oct 19  | 0             | 0                                      |

So: **8 adds since Sep 28, 0 consent events** — the figures in the
brief, confirmed.

Two things the table makes clear that the headline does not:

- Through Sep 13 the two columns are **identical** (11/11, 9/9). The
  pipeline was not broken; it was working one-for-one.
- Sep 14–27 is empty on *both* sides. Part of "no consent events since
  Sep 14" is simply that nobody signed up for two weeks, not that
  consent stopped being recorded.

The divergence starts precisely in the week of Sep 28.

## What changed that week

`c8acf83`, **2026-09-29** — "Build native SMS signup: PDP, footer and
/text". That commit introduced the site's own
`POST https://a.klaviyo.com/client/subscriptions/`.

Before it, every pre-September profile on the list got there one of two
ways, both of which record consent themselves:

- Klaviyo's own hosted form — `$consent_method: "Klaviyo Form"`,
  `$consent_form_id: "UxDQrj"`
- text-to-join — `$source: "JOIN"`, with the "Send this text to
  subscribe to recurring automated personalized marketing alerts…"
  `consent_text`

Neither is this repo's code. The site only started submitting SMS
signups itself on Sep 29, and every signup since then is missing a
consent event.

## The mechanism, in our code

`smsSubscribeBody()` in `assets/site.js` builds two shapes, and
`klaviyoSubscribeSms()` falls back between them:

```js
if (withConsentBlock) {
  profile.subscriptions = { sms: { marketing: { consent: 'SUBSCRIBED' } } };
}
```

```js
var res = await postSmsSubscription(phone, true, location);
if (res.ok) return res.status;
if (res.status === 400) {
  var fallback = await postSmsSubscription(phone, false, location);   // no consent block
  ...
}
```

The bare payload still adds the profile to `UiFFMg` but asserts no SMS
marketing consent. That produces exactly the observed signature: list
membership up, consent events at zero. The comment on that fallback
says outright that neither shape was ever verified against the live
account, because the build sandbox has no outbound network.

## Two causes fit, and they are distinguishable

1. **The consent-block payload is 400ing in production** and every
   signup is landing through the bare fallback. Consent is never
   asserted, so no event fires.
2. **Double opt-in is doing its job.** An API add to a double opt-in
   list starts PENDING and only fires the consent event once the person
   replies to the confirmation text. The 8 would be pending, unconfirmed.

These are not the same problem. Under (1) the 8 are on the list with no
recorded consent, which is a problem for texting them at all. Under (2)
they consented on the site and simply have not confirmed, and the fix is
a confirmation flow, not a code change.

**How to tell, without touching consent wording:**

- Open any of the 8 in Klaviyo. Their SMS consent reads *Subscribed*,
  *Pending*, or is unset. Pending ⇒ cause 2. Unset ⇒ cause 1.
- Or load the site's SMS form with the browser console open and submit
  a test number. Cause 1 prints, from our own code:
  `[asior] SMS subscribe: consent-block payload 400d, bare payload accepted.`
  That line appearing is proof of cause 1; its absence on a 202 is
  proof of cause 2.

I could not run either check from here: the sandbox has no outbound
network to Klaviyo's client endpoint, and the Klaviyo MCP tools
available in this session drop the `filter`, `sort` and
`additional_fields_profile` parameters, so per-profile subscription
state could not be read back.

## Worth noting either way

Whichever cause holds, the fallback should not survive. It was written
as a one-off probe — "delete the loser once someone has seen a real 202
in production" — and a path that silently drops the consent block is
the wrong thing to leave in a live signup. Once the console line above
settles which shape Klaviyo accepts, keep that one and delete the other.
