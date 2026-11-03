'use strict';
(() => {
  const form = document.getElementById('reset-password-form');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';
  const message = document.getElementById('reset-message');
  const password = document.getElementById('new-password');
  const confirm = document.getElementById('confirm-password');
  const button = form.querySelector('[type="submit"]');

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    message.textContent = 'This password reset link is invalid. Request a new one.';
    message.className = 'auth-feedback error';
    message.hidden = false;
    button.disabled = true;
  }
  const validate = () => confirm.setCustomValidity(confirm.value && confirm.value !== password.value ? 'Passwords do not match.' : '');
  password.addEventListener('input', validate);
  confirm.addEventListener('input', validate);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    validate();
    if (!form.reportValidity() || !token) return;
    button.disabled = true;
    message.hidden = true;
    try {
      const result = await PrepifyAPI.post('/auth/reset-password', { token, password: password.value });
      message.textContent = result.message || 'Password reset successfully. You can now log in.';
      message.className = 'auth-feedback success';
      message.hidden = false;
      form.reset();
      history.replaceState({}, document.title, location.pathname);
      setTimeout(() => { location.href = 'login.html'; }, 1800);
    } catch (error) {
      message.textContent = error.message || 'This reset link is invalid or has expired. Request a new one.';
      message.className = 'auth-feedback error';
      message.hidden = false;
      button.disabled = false;
    }
  });
})();
