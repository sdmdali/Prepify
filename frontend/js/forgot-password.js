'use strict';
(() => {
  const form = document.getElementById('forgot-password-form');
  if (!form) return;
  const message = document.getElementById('reset-message');
  const button = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true;
    message.hidden = true;
    try {
      const result = await PrepifyAPI.post('/auth/forgot-password', {
        email: document.getElementById('reset-email').value.trim(),
      });
      message.textContent = result.message || 'If an account exists for that email address, a password reset link has been sent.';
      message.className = 'auth-feedback success';
      message.hidden = false;
      form.reset();
    } catch (error) {
      message.textContent = error.message || 'Unable to send the reset link. Please try again later.';
      message.className = 'auth-feedback error';
      message.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
})();
