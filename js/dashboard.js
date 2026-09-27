/*
 * Library ASBA — Library Management System
 * dashboard.js — bootstrap, routing, role enforcement and event dispatch.
 *
 * Routing is hash-based so the back button and a page refresh both behave the
 * way a user expects. Every route declares which roles may open it, and the
 * check runs on navigation rather than relying on the sidebar simply not
 * offering the link.
 */
(function (window, document) {
  'use strict';

  var LMS = window.LMS;
  var ui = LMS.ui;

  /* ==========================================================================
   * Routes
   * ========================================================================== */

  var ROUTES = {
    home:         { icon: 'dashboard',    roles: ['admin', 'librarian', 'member'], label: 'Dashboard' },
    librarians:   { icon: 'staff',        roles: ['admin'],                        label: 'Librarians' },
    settings:     { icon: 'settings',     roles: ['admin'],                        label: 'Lending rules' },
    students:     { icon: 'students',     roles: ['librarian'],                    label: 'Students' },
    books:        { icon: 'books',        roles: ['librarian'],                    label: 'Books & copies' },
    issue:        { icon: 'issue',        roles: ['librarian'],                    label: 'Issue' },
    'return':     { icon: 'receive',      roles: ['librarian'],                    label: 'Return' },
    reservations: { icon: 'reservations', roles: ['librarian', 'member'],          label: 'Reservations' },
    fines:        { icon: 'payments',     roles: ['librarian'],                    label: 'Fines' },
    reports:      { icon: 'reports',      roles: ['admin', 'librarian'],           label: 'Reports' },
    catalog:      { icon: 'search',       roles: ['member'],                       label: 'Catalogue' },
    loans:        { icon: 'books',        roles: ['member'],                       label: 'My loans' },
    profile:      { icon: 'profile',      roles: ['admin', 'librarian', 'member'], label: 'My profile' }
  };

  var NAV_ORDER = {
    admin: ['home', 'librarians', 'reports', 'settings', 'profile'],
    librarian: ['home', 'students', 'books', 'issue', 'return', 'reservations', 'fines', 'reports', 'profile'],
    member: ['home', 'catalog', 'loans', 'reservations', 'profile']
  };

  var app = {
    account: null,
    role: null,
    page: 'home',

    navigate: function (page) {
      if (!canOpen(page)) {
        ui.toast('You do not have access to that section.', 'error');
        page = 'home';
      }
      if (window.location.hash === '#/' + page) {
        render(page);
      } else {
        window.location.hash = '#/' + page;
      }
    },

    refresh: function () {
      render(app.page);
    },

    syncHeader: syncHeader,

    logout: function () {
      LMS.session.clear();
      window.location.href = 'index.html';
    }
  };

  LMS.app = app;

  function canOpen(page) {
    var route = ROUTES[page];
    return Boolean(route && route.roles.indexOf(app.role) !== -1);
  }

  /* ==========================================================================
   * Bootstrap
   * ========================================================================== */

  LMS.store.ready().then(function () {
    var active = LMS.session.current();

    if (!active) {
      // Assigning location.href does not stop the current script, so the
      // remaining setup has to be skipped explicitly rather than left to run
      // against a null session.
      window.location.replace('index.html');
      return;
    }

    app.account = active.account;
    app.role = active.role;

    document.body.dataset.role = app.role;
    syncHeader();
    buildNavigation();
    bindEvents();

    var initial = pageFromHash();
    if (app.account.mustChangePassword && initial === 'home') initial = 'profile';
    app.navigate(initial);
  }).catch(function (error) {
    document.getElementById('content').innerHTML =
      '<div class="notice notice--danger"><div><p class="notice__title">The library data could not be loaded.</p>' +
      '<p>Reload the page, or reset the stored data from the sign-in screen.</p></div></div>';
    if (window.console) window.console.error(error);
  });

  function pageFromHash() {
    var page = String(window.location.hash || '').replace(/^#\/?/, '');
    return ROUTES[page] ? page : 'home';
  }

  /* ==========================================================================
   * Shell
   * ========================================================================== */

  function syncHeader() {
    var name = app.account.name || 'User';
    document.getElementById('accountName').textContent = name;
    document.getElementById('accountRole').textContent = LMS.roleLabel(app.role);
    document.getElementById('accountAvatar').textContent = name.charAt(0).toUpperCase();
  }

  function buildNavigation() {
    var sidebar = document.getElementById('sidebar');
    var pages = NAV_ORDER[app.role] || NAV_ORDER.member;

    sidebar.innerHTML = String(LMS.html`
      <p class="sidebar__label" id="sidebarLabel">Workspace</p>
      <ul class="sidebar__list">
        ${pages.map(function (page) {
          var route = ROUTES[page];
          return LMS.html`
            <li>
              <button type="button" class="nav-item" data-action="go" data-page="${page}">
                <span class="nav-item__icon">${ui.icon(route.icon, 17)}</span>
                <span>${route.label}</span>
              </button>
            </li>`;
        })}
      </ul>`);
  }

  function setActiveNav(page) {
    var buttons = document.querySelectorAll('#sidebar .nav-item');
    Array.prototype.forEach.call(buttons, function (button) {
      var isCurrent = button.dataset.page === page;
      button.classList.toggle('nav-item--active', isCurrent);
      if (isCurrent) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }

  /* ==========================================================================
   * Rendering
   * ========================================================================== */

  function render(page) {
    // The session is re-checked on every navigation rather than only at boot,
    // so an expiry (or a sign-out elsewhere) takes effect in a tab that has
    // been left open rather than at the next full page load.
    var active = LMS.session.current();
    if (!active) {
      window.location.replace('index.html');
      return;
    }
    app.account = active.account;
    app.role = active.role;

    if (!canOpen(page)) page = 'home';

    app.page = page;
    setActiveNav(page);
    ui.modal.close();

    var content = document.getElementById('content');
    var renderer = LMS.pages[page] || LMS.pages.home;

    try {
      content.innerHTML = String(renderer());
    } catch (error) {
      content.innerHTML =
        '<div class="notice notice--danger"><div><p class="notice__title">This page could not be displayed.</p>' +
        '<p>Try reloading. If it keeps happening, reset the stored data from the lending rules page.</p></div></div>';
      if (window.console) window.console.error(error);
    }

    document.title = (ROUTES[page] ? ROUTES[page].label + ' · ' : '') + LMS.config.appName;
    document.body.classList.remove('nav-open');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ==========================================================================
   * Event dispatch
   *
   * One listener per event type, delegated from the document. Rebuilding a
   * page's markup therefore never leaves stale handlers behind, and no markup
   * needs an inline on* attribute.
   * ========================================================================== */

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-action]');
      if (!trigger || trigger.tagName === 'SELECT') return;

      var name = trigger.dataset.action;

      if (name === 'logout') {
        event.preventDefault();
        app.logout();
        return;
      }
      if (name === 'toggle-nav') {
        event.preventDefault();
        var open = document.body.classList.toggle('nav-open');
        // The scrim also carries this action, so the state is always written
        // back to the button that owns aria-expanded.
        document.querySelector('.topbar__menu').setAttribute('aria-expanded', String(open));
        return;
      }
      if (name === 'close-confirm') {
        event.preventDefault();
        document.getElementById('confirmModal').close();
        return;
      }

      var handler = LMS.actions[name];
      if (!handler) return;

      event.preventDefault();
      handler(trigger.dataset, trigger);
    });

    document.addEventListener('change', function (event) {
      var trigger = event.target.closest('[data-action]');
      if (!trigger || trigger.tagName !== 'SELECT') return;

      var handler = LMS.changeActions[trigger.dataset.action];
      if (handler) handler(trigger.dataset, trigger);
    });

    document.addEventListener('submit', function (event) {
      var form = event.target.closest('[data-form]');
      if (!form) return;

      event.preventDefault();
      var handler = LMS.forms[form.dataset.form];
      if (handler) handler(form);
    });

    document.addEventListener('input', function (event) {
      var field = event.target.closest('[data-filter]');
      if (!field) return;

      var key = field.dataset.filter;
      LMS.filters[key] = field.value;

      var caret = field.selectionStart;
      render(app.page);

      // Re-rendering replaces the input, so focus and caret are restored to
      // keep typing continuous.
      var replacement = document.querySelector('[data-filter="' + key + '"]');
      if (replacement) {
        replacement.focus();
        try {
          replacement.setSelectionRange(caret, caret);
        } catch (error) {
          /* Some input types do not support selection ranges. */
        }
      }
    });

    window.addEventListener('hashchange', function () {
      render(pageFromHash());
    });

    // Keep tabs consistent: another tab signing out, or writing data, should
    // not leave this one showing a stale view.
    window.addEventListener('storage', function (event) {
      if (event.key === LMS.config.sessionKey && !event.newValue) {
        window.location.replace('index.html');
      } else if (event.key === LMS.config.storageKey) {
        window.location.reload();
      }
    });

    // Close dialogs when the backdrop itself is clicked.
    Array.prototype.forEach.call(document.querySelectorAll('dialog'), function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
    });
  }
})(window, document);
