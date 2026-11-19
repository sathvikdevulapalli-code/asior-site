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
    var properties = { signup_location: 'bfcm_vip_page' };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (key) {
      var value = params.get(key);
      if (value) properties[key] = value.slice(0, 120);
    });
    return properties;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    var email = emailInput.value.trim();
    var phoneRaw = phoneInput.value.trim();
    var phone = phoneRaw ? e164(phoneRaw) : null;
    if (!emailInput.checkValidity()) { message('Enter a valid email address.'); emailInput.focus(); return; }
    if (!emailConsent.checked) { message('Please agree to receive the email updates.'); emailConsent.focus(); return; }
    if (phoneRaw && !phone) { message('Enter a valid US or Canadian mobile number.'); phoneInput.focus(); return; }
    if (phoneRaw && !smsConsent.checked) { message('Please check the SMS consent box or clear the phone number.'); smsConsent.focus(); return; }
    if (!phoneRaw && smsConsent.checked) { message('Enter a mobile number for SMS updates or uncheck SMS consent.'); phoneInput.focus(); return; }

    busy = true;
    button.disabled = true;
    message('Adding you to the VIP list…');
    try {
      await subscribe('TFEDaD', { email: email, properties: sourceProperties() });
      try {
        window._learnq = window._learnq || [];
        window._learnq.push(['identify', { $email: email }]);
      } catch (ignored) {}
      if (window.fbq) {
        try { window.fbq('track', 'Lead', { content_name: 'BF drop early access' }); } catch (ignored) {}
      }
      if (phone) {
        try {
          await subscribe('UiFFMg', { phone_number: phone });
          message('You\u2019re on the VIP list. Reply YES to the text we send to confirm SMS. The 20% sale opens November 27 at 2:00 PM CT.');
        } catch (smsError) {
          message('You\u2019re on the VIP list. The SMS request did not go through; please try that separately later.');
        }
      } else {
        message('You\u2019re on the VIP list. The 20% sale opens November 27 at 2:00 PM CT.');
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
