(function () {
  'use strict';

  var form = document.getElementById('vipForm');
  if (!form) return;
  var emailInput = document.getElementById('vipEmail');
  var phoneInput = document.getElementById('vipPhone');
  var emailConsent = document.getElementById('emailConsent');
  var smsConsent = document.getElementById('smsConsent');
  var button = document.getElementById('vipButton');
  var status = document.getElementById('status');
  var busy = false;

  function message(value) { status.textContent = value; }

  function e164(value) {
    var digits = value.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
    return '+1' + digits;
  }

  function subscribe(listId, attributes) {
    return fetch('https://a.klaviyo.com/client/subscriptions/?company_id=QV7rBB', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', revision: '2024-10-15' },
      body: JSON.stringify({
        data: {
          type: 'subscription',
          attributes: { profile: { data: { type: 'profile', attributes: attributes } } },
          relationships: { list: { data: { type: 'list', id: listId } } },
        },
      }),
    }).then(function (response) {
      if (!response.ok) throw new Error('Klaviyo subscription rejected: ' + response.status);
    });
  }

  function sourceProperties() {
    var params = new URLSearchParams(window.location.search);
    var properties = { signup_location: 'bfcm_2026_page' };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (key) {
      var value = params.get(key);
      if (value) properties[key] = value.slice(0, 120);
    });
    return properties;
  }

  /* The number and its consent box live inside a <details>. Focusing
     a control in a collapsed fold does nothing in most browsers, so
     an error about the SMS box would move focus nowhere and the
     visitor would be told to tick something they cannot see. Open the
     fold first; it is a no-op for the fields that are not in one. */
  function reveal(el) {
    var d = el && el.closest ? el.closest('details') : null;
    if (d) d.open = true;
    if (el && el.focus) el.focus();
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    var email = emailInput.value.trim();
    var phoneRaw = phoneInput.value.trim();
    var phone = phoneRaw ? e164(phoneRaw) : null;
    if (!emailInput.checkValidity()) { message('Enter a valid email address.'); reveal(emailInput); return; }
    if (!emailConsent.checked) { message('Please agree to receive the email updates.'); reveal(emailConsent); return; }
    if (phoneRaw && !phone) { message('Enter a valid US or Canadian mobile number.'); reveal(phoneInput); return; }
    if (phoneRaw && !smsConsent.checked) { message('Please check the SMS consent box or clear the phone number.'); reveal(smsConsent); return; }
    if (!phoneRaw && smsConsent.checked) { message('Enter a mobile number for SMS updates or uncheck SMS consent.'); reveal(phoneInput); return; }

    busy = true;
    button.disabled = true;
    message('Saving your Black Friday signup…');
    try {
      await subscribe('SFuK88', { email: email, properties: sourceProperties() });
      try {
        window._learnq = window._learnq || [];
        window._learnq.push(['identify', { $email: email }]);
      } catch (ignored) {}
      if (window.fbq) {
        try { window.fbq('track', 'Lead', { content_name: 'Black Friday 2026 signup' }); } catch (ignored) {}
      }
      if (phone) {
        try {
          await subscribe('UiFFMg', { phone_number: phone });
          message('Check your email and text messages to confirm your subscriptions. The 20% sale opens November 27 at 2:00 PM CT.');
        } catch (smsError) {
          message('Your email request was received. Check your inbox to confirm it. The SMS request did not go through; please try that separately later.');
        }
      } else {
        message('Check your inbox and confirm your email to receive the Black Friday reminder. The 20% sale opens November 27 at 2:00 PM CT.');
      }
      form.reset();
    } catch (error) {
      message('We could not save your signup. Please try again in a moment.');
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
})();
