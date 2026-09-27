/*
 * Library ASBA — Library Management System
 * login.js — sign-in controller.
 *
 * The role is resolved from the account record, not chosen on the form. A
 * sign-in screen that lets the visitor pick their own role is a role selector,
 * not an authentication step.
 */
(function (window, document) {
  'use strict';

  var LMS = window.LMS;
  var ui = LMS.ui;

  var form = document.getElementById('loginForm');
  var emailField = document.getElementById('email');
  var passwordField = document.getElementById('password');
  var submitButton = document.getElementById('loginSubmit');
  var toggleButton = document.getElementById('togglePassword');

  LMS.store.ready().then(function () {
    // Someone with a live session should not be looking at the sign-in form.
    if (LMS.session.current()) {
      window.location.replace('dashboard.html');
      return;
    }
    form.removeAttribute('aria-busy');
  }).catch(function (error) {
    ui.toast('The library data could not be loaded in this browser.', 'error');
    if (window.console) window.console.error(error);
  });

  toggleButton.addEventListener('click', function () {
    var revealed = passwordField.type === 'text';
    passwordField.type = revealed ? 'password' : 'text';
    toggleButton.textContent = revealed ? 'Show' : 'Hide';
    toggleButton.setAttribute('aria-label', revealed ? 'Show password' : 'Hide password');
    passwordField.focus();
  });

  document.addEventListener('click', function (event) {
    var demoButton = event.target.closest('[data-demo-email]');
    if (demoButton) {
      emailField.value = demoButton.dataset.demoEmail;
      passwordField.value = demoButton.dataset.demoPassword;
      passwordField.type = 'password';
      toggleButton.textContent = 'Show';
      submitButton.focus();
      return;
    }

    if (event.target.closest('[data-action="close-confirm"]')) {
      document.getElementById('confirmModal').close();
      return;
    }

    if (event.target.closest('[data-action="reset-data"]')) {
      resetStoredData();
    }
  });

  /**
   * Recovery hatch. Records written by an earlier version of the system carry
   * no password hash, which would otherwise lock every account out with no
   * administrator left to reset them.
   */
  function resetStoredData() {
    ui.confirm({
      title: 'Reset the stored library data?',
      message: 'Every book, student, loan and fine saved in this browser is deleted and ' +
               'replaced with the demonstration data. Use this if you are locked out or ' +
               'upgrading from an older version. This cannot be undone.',
      confirmLabel: 'Delete and reseed',
      tone: 'danger'
    }).then(function (confirmed) {
      if (!confirmed) return;
      LMS.store.reset();
      window.location.reload();
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var email = emailField.value.trim();
    var password = passwordField.value;

    if (!LMS.validate.email(email)) {
      ui.toast('Enter a valid email address.', 'error');
      emailField.focus();
      return;
    }
    if (!password) {
      ui.toast('Enter your password.', 'error');
      passwordField.focus();
      return;
    }

    setBusy(true);

    LMS.auth.login(email, password).then(function (result) {
      if (!result.ok) {
        setBusy(false);
        ui.toast(result.message, 'error');
        passwordField.select();
        return;
      }
      window.location.href = 'dashboard.html';
    }).catch(function (error) {
      setBusy(false);
      ui.toast('Sign-in failed unexpectedly. Please try again.', 'error');
      if (window.console) window.console.error(error);
    });
  });

  function setBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Signing in…' : 'Sign in';
  }
})(window, document);
